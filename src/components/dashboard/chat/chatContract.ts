export type CityChatAssistant = 'dispatch' | 'knowledge'

export type CityChatDispatchSkill =
  | 'dispatch_triage'
  | 'resource_compare'
  | 'impact_analysis'
  | 'dispatch_draft'

export type CityChatContextKind = 'confirmed' | 'reported' | 'simulated' | 'unknown'

export interface CityChatContextFact {
  id: string
  label: string
  value: string
  kind: CityChatContextKind
  sourceIds: string[]
}

export interface CityChatContextOption {
  id: string
  label: string
  summary: string
  impact: string
}

export interface CityChatContextSource {
  id: string
  label: string
  type: 'page' | 'public' | 'simulated' | 'user'
  updatedAt?: string
}

export interface CityChatContextAction {
  id: string
  label: string
  requiresApproval: boolean
}

export interface CityChatContext {
  contextVersion: string
  entryPoint: 'global' | 'event' | 'task' | 'history' | 'knowledge'
  title: string
  scopeLabel: string
  facts: CityChatContextFact[]
  constraints: string[]
  options: CityChatContextOption[]
  sources: CityChatContextSource[]
  availableActions: CityChatContextAction[]
}

export interface CityChatHistoryMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface CityChatRequest {
  assistant: CityChatAssistant
  intentTag?: CityChatDispatchSkill
  conversationId: string
  message: {
    id: string
    text: string
  }
  history: CityChatHistoryMessage[]
  context: CityChatContext
  locale: 'zh-CN'
}

export type CityChatEvidenceKind = 'fact' | 'reported' | 'simulated' | 'inference'

export interface CityChatEvidence {
  label: string
  value: string
  kind: CityChatEvidenceKind
  sourceIds: string[]
}

export interface CityChatUnknown {
  label: string
  whyItMatters: string
  confirmWith: string
}

export interface CityChatRecommendation {
  actionId: string
  action: string
  rationale: string
  impact: string
  approvalRequired: boolean
}

export interface CityChatOption {
  optionId: string
  label: string
  benefit: string
  tradeoff: string
}

export interface CityChatAnswer {
  status: 'answered' | 'needs_confirmation' | 'insufficient_context'
  title: string
  directAnswer: string
  evidence: CityChatEvidence[]
  unknowns: CityChatUnknown[]
  recommendation: CityChatRecommendation | null
  options: CityChatOption[]
  sources: Array<{ id: string; label: string }>
  followUps: string[]
}

export interface CityChatResponse {
  requestId: string
  conversationId: string
  asOf: string
  contextVersion: string
  intent?: {
    id: CityChatDispatchSkill
    label: string
  }
  answer: CityChatAnswer
}

export interface CityChatServiceStatus {
  configured: boolean
}

export interface CityChatErrorPayload {
  error: {
    code: string
    message: string
    retryable: boolean
    requestId?: string
  }
}

export function answerToPlainText(answer: CityChatAnswer) {
  const evidenceKindLabel: Record<CityChatEvidenceKind, string> = {
    fact: '已确认',
    reported: '已上报',
    simulated: '场景推演',
    inference: '模型判断',
  }
  const sourceLabels = new Map(answer.sources.map((source) => [source.id, source.label]))
  const lines = [answer.title, answer.directAnswer]
  if (answer.evidence.length > 0) {
    lines.push('', '依据', ...answer.evidence.map((item) => {
      const labels = item.sourceIds.map((id) => sourceLabels.get(id)).filter(Boolean)
      return `- [${evidenceKindLabel[item.kind]}] ${item.label}：${item.value}${labels.length > 0 ? `（关联来源：${labels.join('、')}）` : ''}`
    }))
  }
  if (answer.unknowns.length > 0) {
    lines.push('', '待确认', ...answer.unknowns.map((item) => `- ${item.label}：${item.whyItMatters}；${item.confirmWith}`))
  }
  if (answer.recommendation) {
    lines.push(
      '',
      `建议：${answer.recommendation.action}`,
      answer.recommendation.rationale,
      `影响：${answer.recommendation.impact}`,
      `动作边界：${answer.recommendation.approvalRequired ? '执行前需要人工批准' : '仅为读取或比较，不触发写操作'}`,
    )
  }
  if (answer.options.length > 0) {
    lines.push('', '可选路径', ...answer.options.map((item) => `- ${item.label}：收益 ${item.benefit}；代价 ${item.tradeoff}`))
  }
  if (answer.sources.length > 0) {
    lines.push('', `本次关联来源：${answer.sources.map((source) => source.label).join('、')}`)
  }
  return lines.filter((line, index, all) => line !== '' || all[index - 1] !== '').join('\n')
}
