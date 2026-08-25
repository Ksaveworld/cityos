import { lazy, memo, Suspense, useMemo, useState } from 'react'
import {
  Archive,
  ArrowRight,
  Bot,
  BookMarked,
  CircleHelp,
  Database,
  FileText,
  MessageSquareText,
  Search,
  ShieldCheck,
} from 'lucide-react'

import { findReviewReport, type ReviewReport } from '../review/reviewReports'
import { KnowledgeChatPanel } from './KnowledgeChatPanel'
import { KnowledgeRailLayout } from './KnowledgeRailLayout'
import { KNOWLEDGE_ENTRIES, type KnowledgeEntry } from './knowledgeData'
import { readKnowledgeRailWidth } from './knowledgeRailState'

const ReviewReportOverlay = lazy(() => import('../review/ReviewReportOverlay'))

const DOMAIN_FILTERS = ['全部', '119 消防', '110 警情', '120 医疗', '交通协同', '重大布防'] as const
type DomainFilter = (typeof DOMAIN_FILTERS)[number]
type KnowledgeView = 'chat' | 'archive'

/**
 * 沉淀知识库：同一条左栏随页签切换为问答记录或案例列表，右侧保持单一工作对象。
 * 演示主线之外的案例收在这里；每条可以重新打开推演，但不会冒充生产知识。
 */
export const KnowledgeBasePanel = memo(function KnowledgeBasePanel({
  onOpenScenario,
}: {
  onOpenScenario: (scenarioId: string) => void
}) {
  const [view, setView] = useState<KnowledgeView>('chat')
  const [railWidth, setRailWidth] = useState(readKnowledgeRailWidth)
  const [keyword, setKeyword] = useState('')
  const [domain, setDomain] = useState<DomainFilter>('全部')
  const [selectedEntryId, setSelectedEntryId] = useState(KNOWLEDGE_ENTRIES[0]?.id ?? '')
  const [openReport, setOpenReport] = useState<ReviewReport | null>(null)
  const [promptRequest, setPromptRequest] = useState<{ id: string; text: string } | null>(null)

  const entries = useMemo(() => {
    const trimmed = keyword.trim()
    return KNOWLEDGE_ENTRIES.filter((entry) => {
      if (domain !== '全部' && entry.domain !== domain) return false
      if (!trimmed) return true
      return [entry.title, entry.facts, entry.unknowns, entry.planSummary, ...entry.sources].some((text) =>
        text.includes(trimmed),
      )
    })
  }, [keyword, domain])

  const selectedEntry = entries.find((entry) => entry.id === selectedEntryId) ?? entries[0] ?? null

  const askAboutEntry = (entry: KnowledgeEntry) => {
    setPromptRequest({
      id: crypto.randomUUID(),
      text: `请只结合“${entry.title}”这条页面案例，说明已知事实、关键未知项，以及它与其他案例不能直接类比的地方。`,
    })
    setView('chat')
  }

  return (
    <section className="absolute inset-0 z-30 flex min-h-0 flex-col overflow-hidden rounded-xl bg-page" aria-label="沉淀知识库">
      <header className="flex h-16 shrink-0 items-center gap-3 bg-page">
        <div className="flex h-full shrink-0 items-center gap-3 rounded-t-xl border border-b-0 border-line bg-surface-card px-5" style={{ width: railWidth }}>
          <span className="grid size-9 place-items-center rounded-xl bg-accent-weak text-accent-strong"><BookMarked size={17} /></span>
          <h1 className="text-[16px] font-semibold tracking-tight text-ink-1">沉淀知识库</h1>
        </div>
        <div className="flex h-full flex-1 items-stretch rounded-t-xl border border-line bg-surface-card" data-knowledge-tabs>
          <button type="button" onClick={() => setView('chat')} className={`flex items-center gap-2 border-b-2 px-8 text-[13px] font-semibold ${view === 'chat' ? 'border-accent-strong bg-accent-weak/50 text-accent-strong' : 'border-transparent text-ink-2 hover:text-ink-1'}`}><Bot size={15} />城安助手</button>
          <button type="button" onClick={() => setView('archive')} className={`flex items-center gap-2 border-b-2 px-8 text-[13px] font-semibold ${view === 'archive' ? 'border-accent-strong bg-accent-weak/50 text-accent-strong' : 'border-transparent text-ink-2 hover:text-ink-1'}`}><Archive size={15} />案例沉淀</button>
        </div>
      </header>

      <div className={`min-h-0 flex-1 ${view === 'chat' ? 'flex' : 'hidden'}`}>
        <KnowledgeChatPanel railWidth={railWidth} onRailWidthChange={setRailWidth} promptRequest={promptRequest} />
      </div>

      <div className={`min-h-0 flex-1 ${view === 'archive' ? 'flex' : 'hidden'}`}>
        <CaseArchivePanel
          entries={entries}
          selectedEntry={selectedEntry}
          railWidth={railWidth}
          keyword={keyword}
          domain={domain}
          onRailWidthChange={setRailWidth}
          onKeywordChange={setKeyword}
          onDomainChange={setDomain}
          onSelectEntry={setSelectedEntryId}
          onAsk={askAboutEntry}
          onOpenScenario={onOpenScenario}
          onOpenReport={setOpenReport}
        />
      </div>

      {openReport && (
        <Suspense fallback={null}>
          <ReviewReportOverlay report={openReport} onClose={() => setOpenReport(null)} />
        </Suspense>
      )}
    </section>
  )
})

function CaseArchivePanel({
  entries,
  selectedEntry,
  railWidth,
  keyword,
  domain,
  onRailWidthChange,
  onKeywordChange,
  onDomainChange,
  onSelectEntry,
  onAsk,
  onOpenScenario,
  onOpenReport,
}: {
  entries: KnowledgeEntry[]
  selectedEntry: KnowledgeEntry | null
  railWidth: number
  keyword: string
  domain: DomainFilter
  onRailWidthChange: (width: number) => void
  onKeywordChange: (value: string) => void
  onDomainChange: (value: DomainFilter) => void
  onSelectEntry: (entryId: string) => void
  onAsk: (entry: KnowledgeEntry) => void
  onOpenScenario: (scenarioId: string) => void
  onOpenReport: (report: ReviewReport) => void
}) {
  const activeCount = entries.filter((entry) => entry.usage === 'demo-active').length

  return (
    <KnowledgeRailLayout
      railWidth={railWidth}
      onRailWidthChange={onRailWidthChange}
      railLabel="案例沉淀列表"
      resizeLabel="调整知识库左栏宽度"
      rail={(
        <>
          <label className="relative">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-3" />
            <input
              value={keyword}
              onChange={(event) => onKeywordChange(event.target.value)}
              aria-label="检索沉淀案例"
              placeholder="检索案例"
              className="h-9 w-full rounded-lg border border-line bg-white pl-8 pr-2 text-label text-ink-1 outline-none transition focus:border-accent-strong"
            />
          </label>

          <label className="mt-2 flex items-center gap-2 rounded-lg border border-line bg-page px-2.5">
            <span className="shrink-0 text-[9px] font-semibold text-ink-3">领域</span>
            <select value={domain} onChange={(event) => onDomainChange(event.target.value as DomainFilter)} aria-label="筛选案例领域" className="h-8 min-w-0 flex-1 bg-transparent text-label text-ink-1 outline-none">
              {DOMAIN_FILTERS.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          </label>

          <div className="mt-3 flex items-center justify-between px-1 text-[9px] font-semibold tracking-wide text-ink-3"><span>案例列表</span><span>{entries.length}</span></div>
          <div className="mt-1.5 min-h-0 flex-1 space-y-1 overflow-y-auto pr-0.5">
            {entries.map((entry) => (
              <button
                key={entry.id}
                type="button"
                onClick={() => onSelectEntry(entry.id)}
                aria-pressed={selectedEntry?.id === entry.id}
                className={`w-full rounded-lg px-2.5 py-2 text-left transition ${selectedEntry?.id === entry.id ? 'bg-accent-weak' : 'hover:bg-sunken'}`}
                style={selectedEntry?.id === entry.id ? { boxShadow: `inset 3px 0 ${entry.domainColor}` } : undefined}
              >
                <span className="flex items-center gap-1.5">
                  <span className="rounded px-1.5 py-px text-[8px] font-bold text-white" style={{ background: entry.domainColor }}>{entry.domain}</span>
                  <span className="ml-auto font-mono text-[8px] text-ink-3">{entry.generatedAt}</span>
                </span>
                <strong className={`mt-1 block text-[10px] leading-4 ${selectedEntry?.id === entry.id ? 'text-accent-strong' : 'text-ink-1'}`}>{entry.title}</strong>
                <span className="mt-1 block text-[9px] text-ink-3">{entry.usage === 'demo-active' ? '当前演示在用' : '归档沉淀'}</span>
              </button>
            ))}
            {entries.length === 0 && <div className="px-2 py-6 text-center text-label text-ink-3">没有匹配的案例</div>}
          </div>

          <div className="mt-2 rounded-xl border border-line bg-page p-3">
            <div className="flex items-center gap-1.5 text-[10px] font-semibold text-ink-1"><Database size={11} className="text-accent-strong" />当前案例范围</div>
            <dl className="mt-2 space-y-1.5 text-[9px] leading-4 text-ink-3">
              <div className="flex justify-between gap-2"><dt>筛选结果</dt><dd className="font-semibold text-ink-2">{entries.length} 条</dd></div>
              <div className="flex justify-between gap-2"><dt>演示在用</dt><dd className="font-semibold text-[#237A52]">{activeCount} 条</dd></div>
              <div className="flex justify-between gap-2"><dt>生产知识</dt><dd className="font-semibold text-[#AD3B44]">0 条</dd></div>
            </dl>
          </div>
        </>
      )}
    >
      {selectedEntry ? (
        <CaseDetail
          entry={selectedEntry}
          onAsk={() => onAsk(selectedEntry)}
          onOpenScenario={() => onOpenScenario(selectedEntry.scenarioId)}
          onOpenReport={onOpenReport}
        />
      ) : (
        <section className="grid min-h-0 place-items-center" aria-label="案例详情空状态">
          <div className="text-center text-label text-ink-3"><CircleHelp size={20} className="mx-auto mb-2" />调整检索条件后选择案例</div>
        </section>
      )}
    </KnowledgeRailLayout>
  )
}

function CaseDetail({
  entry,
  onAsk,
  onOpenScenario,
  onOpenReport,
}: {
  entry: KnowledgeEntry
  onAsk: () => void
  onOpenScenario: () => void
  onOpenReport: (report: ReviewReport) => void
}) {
  const review = findReviewReport(entry.id)

  return (
    <section className="flex min-h-0 min-w-0 flex-col" aria-label={`${entry.title}案例详情`}>
      <header className="shrink-0 border-b border-line bg-white px-5 py-4">
        <div className="flex items-center gap-2">
          <span className="rounded px-1.5 py-0.5 text-[9px] font-bold text-white" style={{ background: entry.domainColor }}>{entry.domain}</span>
          <span className={`rounded px-1.5 py-0.5 text-[9px] font-semibold ${entry.usage === 'demo-active' ? 'bg-[#EAF8F1] text-[#237A52]' : 'bg-sunken text-ink-3'}`}>{entry.usage === 'demo-active' ? '演示主线在用' : '归档沉淀'}</span>
          <span className="ml-auto font-mono text-footnote text-ink-3">{entry.generatedAt}</span>
        </div>
        <div className="mt-2 flex items-start gap-4">
          <div className="min-w-0 flex-1">
            <h2 className="text-[18px] font-semibold tracking-tight text-ink-1">{entry.title}</h2>
            <p className="mt-1 text-label leading-5 text-ink-3">案例保存的是当时可用的信息边界与推演草案，不代表真实调度记录。</p>
          </div>
          <button type="button" onClick={onAsk} className="flex h-9 shrink-0 items-center gap-1.5 rounded-lg bg-accent-strong px-3 text-label font-semibold text-white transition hover:bg-[#4D4DC2]"><MessageSquareText size={13} />基于此案例提问</button>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto p-5">
        <div className="mx-auto max-w-5xl space-y-3">
          <div className="grid grid-cols-3 gap-3 max-[1180px]:grid-cols-1">
            <CaseSection icon={<ShieldCheck size={13} />} label="当时已知" tone="confirmed">{entry.facts}</CaseSection>
            <CaseSection icon={<CircleHelp size={13} />} label="关键未知项" tone="unknown">{entry.unknowns}</CaseSection>
            <CaseSection icon={<Bot size={13} />} label="CityOS 推演草案" tone="simulated">{entry.planSummary}</CaseSection>
          </div>

          <section className="rounded-xl border border-line bg-white p-4 shadow-panel">
            <div className="flex items-center gap-2 text-label font-semibold text-ink-1"><FileText size={13} className="text-accent-strong" />关联来源</div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {entry.sources.map((source) => <span key={source} className="rounded-md bg-sunken px-2 py-1 text-footnote text-ink-2">{source}</span>)}
            </div>
            <div className="mt-3 flex items-start gap-2 border-t border-hairline pt-3 text-footnote leading-5 text-ink-3">
              <Archive size={12} className="mt-1 shrink-0" />
              <span><b className="font-semibold text-ink-2">{entry.origin}</b> · 来源仅表示条目级关联范围，不代表每个字段均已逐项核验；当前为演示草稿，未写入生产知识库。</span>
            </div>
          </section>
        </div>
      </div>

      <footer className="flex shrink-0 items-center gap-2 border-t border-line bg-white px-5 py-3">
        <span className="mr-auto text-footnote text-ink-3">重新打开会进入对应事件的推演入口，不会自动下发任务。</span>
        {review && <button type="button" onClick={() => onOpenReport(review)} className="flex h-8 items-center gap-1.5 rounded-lg border border-accent-strong/40 bg-accent-weak px-3 text-footnote font-semibold text-accent-strong transition hover:bg-[#E3E3F8]"><FileText size={11} />CityOS 对比报告</button>}
        <button type="button" onClick={onOpenScenario} className="flex h-8 items-center gap-1.5 rounded-lg border border-line bg-white px-3 text-footnote font-semibold text-ink-1 transition hover:border-accent-strong/40 hover:text-accent-strong">重新打开推演<ArrowRight size={11} /></button>
      </footer>
    </section>
  )
}

function CaseSection({
  icon,
  label,
  tone,
  children,
}: {
  icon: React.ReactNode
  label: string
  tone: 'confirmed' | 'unknown' | 'simulated'
  children: React.ReactNode
}) {
  const toneClass = {
    confirmed: 'bg-[#EAF8F1] text-[#237A52]',
    unknown: 'bg-[#FFF4DE] text-[#946114]',
    simulated: 'bg-accent-weak text-accent-strong',
  }[tone]

  return (
    <section className="rounded-xl border border-line bg-white p-4 shadow-panel">
      <div className="flex items-center gap-2"><span className={`grid size-7 place-items-center rounded-lg ${toneClass}`}>{icon}</span><h3 className="text-label font-semibold text-ink-1">{label}</h3></div>
      <p className="mt-3 text-label leading-6 text-ink-2">{children}</p>
    </section>
  )
}
