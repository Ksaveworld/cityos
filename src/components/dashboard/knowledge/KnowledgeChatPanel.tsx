import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Bot,
  CircleHelp,
  Copy,
  Database,
  MessageSquarePlus,
  RotateCcw,
  Send,
  Square,
  UserRound,
} from 'lucide-react'

import { ChatAnswerCard, ChatErrorCard } from '../chat/ChatAnswerCard'
import { sendCityChat, CityChatApiError } from '../chat/chatClient'
import {
  answerToPlainText,
  type CityChatContext,
  type CityChatHistoryMessage,
  type CityChatResponse,
} from '../chat/chatContract'
import { useCityChatStatus } from '../chat/useCityChatStatus'
import { KNOWLEDGE_ENTRIES } from './knowledgeData'
import { KnowledgeRailLayout } from './KnowledgeRailLayout'

interface UserMessage {
  id: string
  role: 'user'
  content: string
}

interface AssistantMessage {
  id: string
  role: 'assistant'
  response: CityChatResponse
}

interface ErrorMessage {
  id: string
  role: 'error'
  userMessageId: string
  message: string
  retryable: boolean
}

type ChatMessage = UserMessage | AssistantMessage | ErrorMessage

interface Conversation {
  id: string
  title: string
  messages: ChatMessage[]
}

const initialConversation = (): Conversation => ({
  id: crypto.randomUUID(),
  title: '新对话',
  messages: [],
})

function knowledgeContext(): CityChatContext {
  const sources: CityChatContext['sources'] = []
  const facts: CityChatContext['facts'] = []
  for (const entry of KNOWLEDGE_ENTRIES) {
    const entrySourceId = `${entry.id}-page`
    const citedSourceIds = entry.sources.map((label, index) => {
      const id = `${entry.id}-source-${index + 1}`
      sources.push({
        id,
        label,
        type: entry.origin === '场景推演' ? 'simulated' : 'public',
        updatedAt: entry.generatedAt === '—' ? undefined : entry.generatedAt,
      })
      return id
    })
    sources.push({
      id: entrySourceId,
      label: `${entry.title}（页面沉淀条目）`,
      type: 'page',
      updatedAt: entry.generatedAt === '—' ? undefined : entry.generatedAt,
    })
    facts.push(
      {
        id: `${entry.id}-facts`,
        label: entry.title,
        value: entry.facts,
        kind: entry.origin === '场景推演' ? 'simulated' : 'reported',
        sourceIds: citedSourceIds.length > 0 ? citedSourceIds : [entrySourceId],
      },
      {
        id: `${entry.id}-unknowns`,
        label: `${entry.title}的待确认项`,
        value: entry.unknowns,
        kind: 'unknown',
        sourceIds: [entrySourceId],
      },
      {
        id: `${entry.id}-plan`,
        label: `${entry.title}的页面方案`,
        value: entry.planSummary,
        kind: 'simulated',
        sourceIds: [entrySourceId],
      },
    )
  }
  return {
    contextVersion: 'knowledge-page-2026-08-21-v2',
    entryPoint: 'knowledge',
    title: 'CityOS 沉淀知识页面',
    scopeLabel: `${KNOWLEDGE_ENTRIES.length} 条页面条目 · 0 条生产知识`,
    facts,
    constraints: [
      '只能使用本次上下文中的页面条目与来源，不得补充外部常识为业务事实。',
      '公开报道口径属于已上报信息，不等于已由本系统独立核实。',
      '标记为场景推演的内容不得写成真实事件或生产运行结果。',
      '来源是条目级关联范围，不代表每个字段都已由每个来源逐一核实。',
      '当前未连接生产知识库、RAG、权限系统或知识入库工作流。',
    ],
    options: [],
    sources,
    availableActions: [
      { id: 'open-page-entry', label: '打开页面案例', requiresApproval: false },
      { id: 'save-knowledge-draft', label: '保存为知识草稿', requiresApproval: true },
    ],
  }
}

function toHistory(messages: ChatMessage[]): CityChatHistoryMessage[] {
  return messages.flatMap((message): CityChatHistoryMessage[] => {
    if (message.role === 'user') return [{ role: 'user', content: message.content.slice(0, 3_800) }]
    if (message.role === 'assistant') return [{ role: 'assistant', content: answerToPlainText(message.response.answer).slice(0, 3_800) }]
    return []
  }).slice(-10)
}

export function KnowledgeChatPanel({
  railWidth,
  onRailWidthChange,
  promptRequest,
}: {
  railWidth: number
  onRailWidthChange: (width: number) => void
  promptRequest?: { id: string; text: string } | null
}) {
  const [conversations, setConversations] = useState<Conversation[]>(() => [initialConversation()])
  const [activeId, setActiveId] = useState(() => conversations[0]?.id ?? '')
  const [draft, setDraft] = useState('')
  const [pendingConversationId, setPendingConversationId] = useState<string | null>(null)
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const conversationEndRef = useRef<HTMLDivElement | null>(null)
  const status = useCityChatStatus()
  const chatReady = status.state === 'ready' && status.value.configured
  const chatBlockedMessage = status.state === 'loading'
    ? '正在检查智能服务配置'
    : status.state === 'unreachable'
      ? '智能服务暂不可达，恢复后可提问'
      : status.value.configured
        ? null
        : '智能服务未配置，配置后可提问'
  const active = conversations.find((conversation) => conversation.id === activeId) ?? conversations[0]
  const generating = pendingConversationId === active?.id
  const lastUserMessage = useMemo(
    () => [...(active?.messages ?? [])].reverse().find((message): message is UserMessage => message.role === 'user'),
    [active],
  )

  useEffect(() => {
    if (active?.messages.length === 0) return
    conversationEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [active?.messages, generating])

  useEffect(() => () => abortRef.current?.abort('unmount'), [])

  const updateConversation = (id: string, update: (conversation: Conversation) => Conversation) => {
    setConversations((current) => current.map((conversation) => conversation.id === id ? update(conversation) : conversation))
  }

  const createConversation = () => {
    const controller = abortRef.current
    abortRef.current = null
    controller?.abort('conversation-change')
    setPendingConversationId(null)
    const conversation = initialConversation()
    setConversations((current) => [conversation, ...current])
    setActiveId(conversation.id)
    setDraft('')
  }

  useEffect(() => {
    if (!promptRequest) return
    const controller = abortRef.current
    abortRef.current = null
    controller?.abort('conversation-change')
    setPendingConversationId(null)
    const conversation = initialConversation()
    setConversations((current) => [conversation, ...current])
    setActiveId(conversation.id)
    setDraft(promptRequest.text)
  }, [promptRequest])

  const selectConversation = (conversationId: string) => {
    if (conversationId === activeId) return
    const controller = abortRef.current
    abortRef.current = null
    controller?.abort('conversation-change')
    setPendingConversationId(null)
    setActiveId(conversationId)
    setDraft('')
  }

  const submit = async (text: string, options?: { regenerate?: boolean; retryErrorId?: string; userMessageId?: string }) => {
    const question = text.trim()
    if (!chatReady || !question || abortRef.current || !active) return
    const conversationId = active.id
    const retryInsertIndex = options?.retryErrorId
      ? active.messages.findIndex((message) => message.id === options.retryErrorId)
      : -1
    const baseMessages = options?.retryErrorId
      ? active.messages.filter((message) => message.id !== options.retryErrorId)
      : options?.regenerate
      ? active.messages.filter((message, index, messages) => !(index === messages.length - 1 && (message.role === 'assistant' || message.role === 'error')))
      : [...active.messages, { id: crypto.randomUUID(), role: 'user' as const, content: question }]
    const currentUser = options?.userMessageId
      ? baseMessages.find((message): message is UserMessage => message.role === 'user' && message.id === options.userMessageId)
      : [...baseMessages].reverse().find((message): message is UserMessage => message.role === 'user')
    if (!currentUser) return
    const insertReply = (conversation: Conversation, reply: AssistantMessage | ErrorMessage) => {
      if (retryInsertIndex < 0) return { ...conversation, messages: [...conversation.messages, reply] }
      const messages = [...conversation.messages]
      messages.splice(Math.min(retryInsertIndex, messages.length), 0, reply)
      return { ...conversation, messages }
    }

    updateConversation(conversationId, (conversation) => ({
      ...conversation,
      title: conversation.title === '新对话' ? question.slice(0, 18) : conversation.title,
      messages: baseMessages,
    }))
    setDraft('')
    setPendingConversationId(conversationId)
    const controller = new AbortController()
    abortRef.current = controller

    try {
      const historyMessages = baseMessages.slice(0, baseMessages.lastIndexOf(currentUser))
      const response = await sendCityChat({
        assistant: 'knowledge',
        conversationId,
        message: { id: currentUser.id, text: currentUser.content },
        history: toHistory(historyMessages),
        context: knowledgeContext(),
        locale: 'zh-CN',
      }, { signal: controller.signal })
      const reply: AssistantMessage = { id: crypto.randomUUID(), role: 'assistant', response }
      updateConversation(conversationId, (conversation) => insertReply(conversation, reply))
    } catch (error) {
      if (controller.signal.reason === 'conversation-change' || controller.signal.reason === 'unmount') return
      const details = error instanceof DOMException && error.name === 'AbortError'
        ? { message: '已停止本次生成，当前问题仍可重试。', retryable: true }
        : error instanceof CityChatApiError
          ? { message: error.message, retryable: error.retryable }
          : { message: '智能服务暂时不可用，请稍后重试。', retryable: true }
      const reply: ErrorMessage = { id: crypto.randomUUID(), role: 'error', userMessageId: currentUser.id, ...details }
      updateConversation(conversationId, (conversation) => insertReply(conversation, reply))
    } finally {
      if (abortRef.current === controller) {
        abortRef.current = null
        setPendingConversationId((current) => current === conversationId ? null : current)
      }
    }
  }

  const regenerate = () => {
    if (lastUserMessage) void submit(lastUserMessage.content, { regenerate: true })
  }

  const retryError = (messageId: string) => {
    if (!active) return
    const error = active.messages.find((message): message is ErrorMessage => message.role === 'error' && message.id === messageId)
    if (!error) return
    const user = active.messages.find((message): message is UserMessage => message.role === 'user' && message.id === error.userMessageId)
    if (user) void submit(user.content, { retryErrorId: error.id, userMessageId: user.id })
  }

  const copyMessage = async (message: AssistantMessage) => {
    await navigator.clipboard.writeText(answerToPlainText(message.response.answer))
    setCopiedMessageId(message.id)
    window.setTimeout(() => setCopiedMessageId((current) => current === message.id ? null : current), 1_200)
  }

  if (!active) return null

  return (
    <KnowledgeRailLayout
      railWidth={railWidth}
      onRailWidthChange={onRailWidthChange}
      railLabel="城安助手问答记录"
      resizeLabel="调整知识库左栏宽度"
      rail={(
        <>
        <button type="button" onClick={createConversation} className="flex h-11 items-center justify-center gap-2 rounded-xl bg-accent-strong text-[13px] font-semibold text-white transition hover:bg-[#4D4DC2]"><MessageSquarePlus size={16} />新建对话</button>
        <div className="mt-4 flex items-center justify-between px-1 text-[11px] font-semibold text-ink-3"><span>问答记录</span><span>{conversations.length}</span></div>
        <div className="mt-2 min-h-0 flex-1 space-y-1 overflow-y-auto">
          {conversations.map((conversation) => (
            <button key={conversation.id} type="button" onClick={() => selectConversation(conversation.id)} className={`h-10 w-full truncate rounded-xl px-3 text-left text-[13px] transition ${conversation.id === active.id ? 'bg-accent-weak font-semibold text-accent-strong' : 'text-ink-2 hover:bg-sunken'}`}>{conversation.title}</button>
          ))}
        </div>
        <div className="mt-3 rounded-xl border border-line bg-page px-3 py-3">
          <div className="flex items-center gap-1.5 text-[11px] font-semibold text-ink-1"><Database size={12} className="text-accent-strong" />本次回答范围</div>
          <dl className="mt-2 space-y-1.5 text-[10px] leading-4 text-ink-3">
            <div className="flex justify-between gap-2"><dt>页面资料</dt><dd className="font-semibold text-ink-2">{KNOWLEDGE_ENTRIES.length} 条</dd></div>
            <div className="flex justify-between gap-2"><dt>生产知识</dt><dd className="font-semibold text-[#AD3B44]">0 条</dd></div>
            <div className="flex justify-between gap-2"><dt>外部检索</dt><dd className="font-semibold text-ink-2">未接入</dd></div>
          </dl>
        </div>
        </>
      )}
    >

      <section className="flex min-h-0 min-w-0 flex-col overflow-hidden rounded-b-xl border border-t-0 border-line bg-page" aria-label="City OS 城安助手">
        <header className="flex h-14 shrink-0 items-center gap-3 border-b border-line bg-white px-6">
          <span className="grid size-9 place-items-center rounded-full bg-accent-weak text-accent-strong"><Bot size={16} /></span>
          <div>
            <h2 className="text-[16px] font-semibold leading-none text-ink-1">城安助手</h2>
            <p className="mt-1.5 text-[12px] text-ink-3">查询历史案例与处置分析</p>
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-10 py-5">
          <div className="mx-auto max-w-[980px]">
            {active.messages.length === 0 ? (
              <div className="space-y-4" data-knowledge-welcome>
                <section className="rounded-2xl border border-[#DADAF9] bg-white px-5 py-4 shadow-panel">
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-accent-weak px-2.5 py-1 text-[11px] font-bold text-accent-strong"><CircleHelp size={12} />案例可查</span>
                  <h3 className="mt-3 text-[18px] font-semibold tracking-tight text-ink-1">案例知识库</h3>
                  <p className="mt-2 text-[13px] font-semibold leading-5 text-ink-2">查询历史处置案例，分析方案差异、执行问题和可复用经验。</p>
                </section>

                <section className="flex items-start gap-3" aria-label="城安助手开场对话">
                  <span className="grid size-9 shrink-0 place-items-center rounded-full bg-accent-strong text-white shadow-panel"><Bot size={16} /></span>
                  <div className="min-w-0 max-w-[720px]">
                    <div className="mb-1.5 text-[12px] font-semibold text-ink-2">城安助手</div>
                    <div className="space-y-2">
                      <p className="w-fit rounded-2xl rounded-tl-sm border border-line bg-white px-4 py-2.5 text-[13px] font-semibold leading-5 text-ink-1 shadow-panel">你好，我可以根据当前页面资料，帮你查案例、比差异、找缺口。</p>
                      <p className="rounded-2xl rounded-tl-sm border border-line bg-white px-4 py-2.5 text-[13px] font-semibold leading-5 text-ink-1 shadow-panel">你可以直接问：这个案例说清了什么？还缺哪些关键信息？和其他案例哪里不同？</p>
                    </div>
                  </div>
                </section>
              </div>
            ) : (
              <div className="space-y-4">
                {active.messages.map((message) => {
                  if (message.role === 'user') {
                    return <article key={message.id} className="flex justify-end gap-2.5"><div className="max-w-[72%] rounded-xl rounded-tr-sm border border-[#C9DBF8] bg-[#EEF4FF] px-3 py-2.5 text-body leading-6 text-[#243653]">{message.content}</div><span className="grid size-8 shrink-0 place-items-center rounded-lg bg-[#EAF8F1] text-[#237A52]"><UserRound size={15} /></span></article>
                  }
                  if (message.role === 'error') {
                    return <ChatErrorCard key={message.id} message={message.message} retryable={message.retryable} onRetry={chatReady ? () => retryError(message.id) : undefined} />
                  }
                  return (
                    <article key={message.id} data-knowledge-answer>
                      <div className="mb-1.5 flex items-center gap-2 px-1">
                        <span className="grid size-7 place-items-center rounded-lg bg-accent-weak text-accent-strong"><Bot size={13} /></span>
                        <div><div className="text-label font-semibold text-ink-1">城安助手</div><div className="text-[9px] text-ink-3">智能助手 · 页面资料边界</div></div>
                        <button type="button" onClick={() => void copyMessage(message)} aria-label="复制回答" className="ml-auto flex h-7 items-center gap-1 rounded-lg border border-line bg-white px-2 text-[9px] text-ink-3 hover:text-ink-1"><Copy size={10} />{copiedMessageId === message.id ? '已复制' : '复制'}</button>
                      </div>
                      <ChatAnswerCard response={message.response} onFollowUp={chatReady ? (question) => void submit(question) : undefined} />
                    </article>
                  )
                })}
                {generating && (
                  <div className="flex items-center gap-2.5" aria-live="polite"><span className="grid size-8 place-items-center rounded-lg bg-accent-weak text-accent-strong"><Bot size={15} /></span><div className="flex h-10 items-center gap-1 rounded-lg border border-line bg-white px-3"><i className="size-1.5 animate-pulse rounded-full bg-accent-strong" /><i className="size-1.5 animate-pulse rounded-full bg-accent-strong [animation-delay:120ms]" /><i className="size-1.5 animate-pulse rounded-full bg-accent-strong [animation-delay:240ms]" /><span className="ml-1.5 text-footnote text-ink-3">正在核对页面资料</span></div></div>
                )}
                <div ref={conversationEndRef} aria-hidden />
              </div>
            )}
          </div>
        </div>

        <div className="shrink-0 border-t border-line bg-white px-5 py-3">
            <div className="mx-auto max-w-4xl">
              <div className="mb-1.5 flex items-center gap-1.5 text-[10px] text-ink-3">
                <CircleHelp size={11} className="text-accent-strong" />
                <span>可问事实、差异和待确认项</span>
              </div>
              <div className="flex items-end gap-2 rounded-2xl border border-line bg-white p-2 shadow-panel focus-within:border-accent-strong">
                <textarea aria-label="输入知识问题" value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); void submit(draft) } }} rows={1} disabled={!chatReady} placeholder={chatBlockedMessage ?? '输入你的问题'} className="min-h-9 flex-1 resize-none border-0 bg-transparent px-1 py-2 text-[13px] leading-5 text-ink-1 outline-none disabled:cursor-not-allowed disabled:text-ink-3" />
                {generating ? (
                  <button type="button" onClick={() => abortRef.current?.abort()} aria-label="停止生成" className="grid size-9 shrink-0 place-items-center rounded-lg border border-line text-ink-2 hover:bg-sunken"><Square size={13} fill="currentColor" /></button>
                ) : (
                  <button type="button" onClick={() => void submit(draft)} disabled={!chatReady || !draft.trim()} aria-label="发送问题" className="grid size-9 shrink-0 place-items-center rounded-lg bg-accent-strong text-white hover:bg-[#4D4DC2] disabled:cursor-not-allowed disabled:bg-line disabled:text-ink-3"><Send size={14} /></button>
                )}
              </div>
              <div className="mt-1.5 flex items-center gap-3 text-[10px] text-ink-3">
                <span className={chatReady ? '' : 'text-[#8A6A24]'}>{chatReady ? '智能服务已连接 · 未接生产知识库或 RAG' : chatBlockedMessage}</span>
                <span className="ml-auto text-[#8A6A24]">内容由 AI 生成，请仔细甄别</span>
                <button type="button" onClick={regenerate} disabled={!chatReady || !lastUserMessage || generating} className="flex items-center gap-1 rounded px-1.5 py-1 hover:bg-sunken disabled:cursor-not-allowed disabled:opacity-40"><RotateCcw size={10} />重新生成</button>
              </div>
            </div>
          </div>
      </section>
    </KnowledgeRailLayout>
  )
}
