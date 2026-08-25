import {
  AlertTriangle,
  ArrowUpRight,
  CheckCircle2,
  CircleHelp,
  Lightbulb,
  Link2,
  Scale,
} from 'lucide-react'

import type { CityChatAnswer, CityChatEvidenceKind, CityChatResponse } from './chatContract'

const EVIDENCE_LABELS: Record<CityChatEvidenceKind, string> = {
  fact: '已确认',
  reported: '已上报',
  simulated: '场景推演',
  inference: '模型判断',
}

const EVIDENCE_TONES: Record<CityChatEvidenceKind, string> = {
  fact: 'bg-[#EAF8F1] text-[#237A52]',
  reported: 'bg-[#EEF4FF] text-[#2768CA]',
  simulated: 'bg-accent-weak text-accent-strong',
  inference: 'bg-[#FFF5DE] text-[#946114]',
}

export function ChatAnswerCard({
  response,
  onFollowUp,
}: {
  response: CityChatResponse
  onFollowUp?: (question: string) => void
}) {
  const { answer } = response
  const sourceLabels = new Map(answer.sources.map((source) => [source.id, source.label]))
  const StatusIcon = answer.status === 'answered' ? CheckCircle2 : answer.status === 'needs_confirmation' ? AlertTriangle : CircleHelp
  const statusIconTone = answer.status === 'answered'
    ? 'bg-accent-weak text-accent-strong'
    : 'bg-[#FFF5DE] text-[#946114]'
  return (
    <div className="overflow-hidden rounded-2xl border border-line bg-white shadow-panel" data-chat-answer aria-live="polite">
      <section className="border-b border-hairline px-4 py-3.5">
        <div className="flex items-start gap-3">
          <span className={`mt-0.5 grid size-7 shrink-0 place-items-center rounded-lg ${statusIconTone}`}><StatusIcon size={14} /></span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-title leading-5 text-ink-1">{answer.title}</h3>
              {answer.status !== 'answered' && (
                <span className="rounded-full bg-[#FFF5DE] px-2 py-0.5 text-[9px] font-bold text-[#946114]">{answer.status === 'needs_confirmation' ? '需要确认' : '依据不足'}</span>
              )}
            </div>
            <p className="mt-1.5 text-body leading-6 text-ink-1">{answer.directAnswer}</p>
          </div>
        </div>
      </section>

      {(answer.evidence.length > 0 || answer.unknowns.length > 0) && (
        <div className="grid gap-3 p-3 min-[1180px]:grid-cols-2">
          {answer.evidence.length > 0 && (
            <AnswerSection icon={<Link2 size={13} />} title="回答依据">
              <div className="space-y-2">
                {answer.evidence.map((item, index) => (
                  <div key={`${item.label}-${index}`} className="rounded-lg border border-hairline bg-page px-3 py-2.5">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className={`rounded px-1.5 py-0.5 text-[9px] font-bold ${EVIDENCE_TONES[item.kind]}`}>{EVIDENCE_LABELS[item.kind]}</span>
                      <strong className="text-label text-ink-1">{item.label}</strong>
                    </div>
                    <p className="mt-1.5 text-label leading-5 text-ink-2">{item.value}</p>
                    <p className="mt-1.5 text-[9px] leading-4 text-ink-3">关联来源：{item.sourceIds.map((id) => sourceLabels.get(id)).filter(Boolean).join('、')}</p>
                  </div>
                ))}
              </div>
            </AnswerSection>
          )}

          {answer.unknowns.length > 0 && (
            <AnswerSection icon={<CircleHelp size={13} />} title="还需确认" tone="warning">
              <div className="space-y-2">
                {answer.unknowns.map((item, index) => (
                  <div key={`${item.label}-${index}`} className="rounded-lg border border-[#F0D8A8] bg-[#FFFBF2] px-3 py-2.5">
                    <strong className="text-label text-[#70470D]">{item.label}</strong>
                    <p className="mt-1 text-label leading-5 text-ink-2">{item.whyItMatters}</p>
                    <p className="mt-1 text-footnote leading-4 text-[#8A5A13]">核实：{item.confirmWith}</p>
                  </div>
                ))}
              </div>
            </AnswerSection>
          )}
        </div>
      )}

      {(answer.recommendation || answer.options.length > 0) && (
        <div className="grid gap-3 border-t border-hairline bg-sunken/35 p-3 min-[1180px]:grid-cols-2">
          {answer.recommendation && <Recommendation answer={answer} />}
          {answer.options.length > 0 && (
            <AnswerSection icon={<Scale size={13} />} title="可选路径">
              <div className="space-y-2">
                {answer.options.map((option, index) => (
                  <div key={`${option.label}-${index}`} className="rounded-lg border border-line bg-white px-3 py-2.5">
                    <strong className="text-label text-ink-1">{option.label}</strong>
                    <p className="mt-1 text-footnote leading-4 text-[#237A52]">收益：{option.benefit}</p>
                    <p className="mt-1 text-footnote leading-4 text-ink-3">代价：{option.tradeoff}</p>
                  </div>
                ))}
              </div>
            </AnswerSection>
          )}
        </div>
      )}

      <footer className="flex flex-wrap items-center gap-2 border-t border-hairline px-4 py-2.5 text-footnote text-ink-3">
        <span>智能生成</span>
        <span aria-hidden>·</span>
        <span>{new Date(response.asOf).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}</span>
        {answer.sources.length > 0 && <><span aria-hidden>·</span><span className="min-w-0 truncate">本次关联来源：{answer.sources.map((source) => source.label).join('、')}</span></>}
      </footer>

      {onFollowUp && answer.followUps.length > 0 && (
        <div className="flex flex-wrap gap-1.5 border-t border-hairline px-3 py-2.5">
          {answer.followUps.slice(0, 3).map((question) => (
            <button key={question} type="button" onClick={() => onFollowUp(question)} className="flex items-center gap-1 rounded-lg border border-line bg-white px-2.5 py-1.5 text-footnote text-ink-2 transition hover:border-accent-strong/40 hover:text-accent-strong">{question}<ArrowUpRight size={10} /></button>
          ))}
        </div>
      )}
    </div>
  )
}

function AnswerSection({
  icon,
  title,
  tone = 'default',
  children,
}: {
  icon: React.ReactNode
  title: string
  tone?: 'default' | 'warning'
  children: React.ReactNode
}) {
  return (
    <section className="min-w-0">
      <div className={`mb-2 flex items-center gap-1.5 text-section ${tone === 'warning' ? 'text-[#8A5A13]' : 'text-ink-1'}`}>{icon}{title}</div>
      {children}
    </section>
  )
}

function Recommendation({ answer }: { answer: CityChatAnswer }) {
  if (!answer.recommendation) return null
  return (
    <AnswerSection icon={<Lightbulb size={13} />} title="建议动作">
      <div className="rounded-xl border border-accent-strong/25 bg-accent-weak/55 p-3">
        <strong className="text-body text-accent-strong">{answer.recommendation.action}</strong>
        <p className="mt-1.5 text-label leading-5 text-ink-1">{answer.recommendation.rationale}</p>
        <p className="mt-1.5 text-footnote leading-4 text-ink-3">影响：{answer.recommendation.impact}</p>
        {answer.recommendation.approvalRequired && <div className="mt-2 flex items-center gap-1.5 rounded-lg bg-white/80 px-2 py-1.5 text-footnote font-semibold text-[#AD3B44]"><AlertTriangle size={11} />仅形成建议，执行前仍需人工批准</div>}
      </div>
    </AnswerSection>
  )
}

export function ChatErrorCard({ message, retryable, onRetry }: { message: string; retryable: boolean; onRetry?: () => void }) {
  return (
    <div className="flex items-start gap-2.5 rounded-xl border border-[#F1C9CC] bg-[#FFF6F6] p-3 text-label leading-5 text-[#8B3037]" role="alert">
      <AlertTriangle size={14} className="mt-0.5 shrink-0" />
      <div className="min-w-0 flex-1"><strong className="block">本次没有生成业务回答</strong><span className="mt-0.5 block text-[#9B4B51]">{message}</span></div>
      {retryable && onRetry && <button type="button" onClick={onRetry} className="shrink-0 rounded-lg border border-[#E8B7BA] bg-white px-2.5 py-1 text-footnote font-semibold hover:bg-[#FFF0F0]">重试</button>}
    </div>
  )
}
