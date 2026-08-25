import type { CityChatDispatchSkill, CityChatEvidence, CityChatResponse } from '../chat/chatContract'
import type { TaskDispatchOverride } from '../workflow/types'
import {
  resolveDispatchOptionAnalysis,
  type ActiveDispatchEvent,
  type DispatchException,
  type DispatchOptionAnalysis,
} from './activeEventDispatchModel'

export interface DispatchDemoReply {
  response: CityChatResponse
  proposedOptionId?: string
}

function normalize(value: string) {
  return value.toLowerCase().replace(/[\s，。、“”‘’·（）()-]/g, '').replace(/广州市/g, '广州')
}

function optionMentioned(question: string, options: TaskDispatchOverride[]) {
  const normalizedQuestion = normalize(question)
  return options.find((option) => normalizedQuestion.includes(normalize(option.optionLabel))) ?? null
}

function responseBase(
  event: ActiveDispatchEvent,
  requestId: string,
  contextVersion: string,
  intent: CityChatDispatchSkill,
) {
  return {
    requestId,
    conversationId: `dispatch-${event.id}`,
    asOf: new Date().toISOString(),
    contextVersion,
    intent: {
      id: intent,
      label: intent === 'dispatch_draft' ? '调整草案' : intent === 'resource_compare' ? '资源比选' : '异常研判',
    },
  } satisfies Omit<CityChatResponse, 'answer'>
}

function optionRows(event: ActiveDispatchEvent, exception: DispatchException) {
  return exception.options.map((option, index) => {
    const analysis = resolveDispatchOptionAnalysis(event, option, index)
    return {
      optionId: option.optionId,
      label: `${option.optionLabel}${analysis.recommended ? '（建议优先）' : ''}`,
      benefit: analysis.benefit,
      tradeoff: analysis.tradeoff,
    }
  })
}

function comparisonEvidence(analysis: DispatchOptionAnalysis) {
  const evidence: CityChatEvidence[] = []
  if (analysis.stateReason) {
    evidence.push({
      label: '候选接收状态',
      value: analysis.stateReason,
      kind: 'simulated',
      sourceIds: ['dispatch-candidate-state'],
    })
  }
  if (analysis.distanceReason) {
    evidence.push({
      label: '静态点位距离比较',
      value: analysis.distanceReason,
      kind: 'inference',
      sourceIds: ['dispatch-event-position', 'dispatch-facility-poi'],
    })
  }
  return evidence
}

function comparisonSources() {
  return [
    { id: 'dispatch-candidate-state', label: '当前候选接收状态（场景台账）' },
    { id: 'dispatch-event-position', label: '当前事件点位（场景台账）' },
    { id: 'dispatch-facility-poi', label: '医院公开静态点位' },
  ]
}

export function createDispatchDemoReply({
  event,
  exception,
  question,
  requestId,
  contextVersion,
  intentTag,
}: {
  event: ActiveDispatchEvent
  exception: DispatchException
  question: string
  requestId: string
  contextVersion: string
  intentTag?: CityChatDispatchSkill
}): DispatchDemoReply | null {
  const selectedOption = optionMentioned(question, exception.options)
  if (selectedOption) {
    const selectedIndex = exception.options.findIndex((option) => option.optionId === selectedOption.optionId)
    const analysis = resolveDispatchOptionAnalysis(event, selectedOption, selectedIndex)
    const isRecommended = analysis.recommended
    return {
      proposedOptionId: selectedOption.optionId,
      response: {
        ...responseBase(event, requestId, contextVersion, 'dispatch_draft'),
        answer: {
          status: isRecommended ? 'answered' : 'needs_confirmation',
          title: isRecommended
            ? `已形成“${selectedOption.optionLabel}”待确认修改`
            : `已保留“${selectedOption.optionLabel}”非首选待确认修改`,
          directAnswer: isRecommended
            ? `已将“${selectedOption.optionLabel}”设为本次资源调整候选。系统不会直接下发；取得医院接收回传并由人工确认后，才会生成 v${event.session.planVersion + 1} 任务包并跳转到任务下发页。`
            : `已保留“${selectedOption.optionLabel}”作为人工选择，但当前比较结果不支持把它作为第一联络顺序。请先取得新的医院接收回传；系统不会直接下发，人工确认后才会生成 v${event.session.planVersion + 1} 任务包。`,
          evidence: [
            {
              label: '当前异常',
              value: `${exception.title}；${exception.detail}`,
              kind: 'simulated',
              sourceIds: ['workflow-feedback'],
            },
            {
              label: '待确认调整',
              value: selectedOption.optionLabel,
              kind: 'simulated',
              sourceIds: ['workflow-task-package'],
            },
            ...comparisonEvidence(analysis),
          ],
          unknowns: [
            {
              label: '实时接收能力',
              whyItMatters: analysis.tradeoff,
              confirmWith: '医疗协同负责人 / 医院接收回传',
            },
          ],
          recommendation: {
            actionId: 'apply-dispatch-resolution',
            action: isRecommended
              ? `取得接收回传后生成 ${selectedOption.optionLabel} 调整任务包`
              : `补充接收确认后再生成 ${selectedOption.optionLabel} 调整任务包`,
            rationale: `${analysis.benefit}${analysis.tradeoff}`,
            impact: `任务包版本将从 v${event.session.planVersion} 更新为 v${event.session.planVersion + 1}，原接收安排被替换。`,
            approvalRequired: true,
          },
          options: optionRows(event, exception),
          sources: [
            { id: 'workflow-feedback', label: '当前页面执行回传' },
            { id: 'workflow-task-package', label: `人工批准任务包 v${event.session.planVersion}` },
            ...comparisonSources(),
          ],
          followUps: [],
        },
      },
    }
  }

  const analysisRequested = intentTag === 'dispatch_triage'
    || intentTag === 'resource_compare'
    || /(分析|异常|原因|医院|候选|比较|推荐|为什么)/.test(question)
  if (!analysisRequested) return null

  const recommendedIndex = exception.options.findIndex((option, index) => resolveDispatchOptionAnalysis(event, option, index).recommended)
  const recommended = exception.options[Math.max(0, recommendedIndex)]
  const recommendedAnalysis = resolveDispatchOptionAnalysis(event, recommended, Math.max(0, recommendedIndex))
  return {
    response: {
      ...responseBase(event, requestId, contextVersion, intentTag === 'resource_compare' ? 'resource_compare' : 'dispatch_triage'),
      answer: {
        status: 'answered',
        title: `${exception.title}：需要重新确认接收安排`,
        directAnswer: `当前任务包的异常来自新的执行回传：原接收安排不能继续沿用。系统比较结果：${recommendedAnalysis.benefit}这只决定接收确认顺序，不代表医院已确认接收。`,
        evidence: [
          {
            label: '异常触发',
            value: exception.detail,
            kind: 'simulated',
            sourceIds: ['workflow-feedback'],
          },
          {
            label: '当前医疗协同单元',
            value: `${recommended.vehicles}；两种医院选择均保留这一任务包资源，只改变接收点。`,
            kind: 'simulated',
            sourceIds: ['workflow-task-package'],
          },
          ...comparisonEvidence(recommendedAnalysis),
        ],
        unknowns: [
          {
            label: '医院实时状态',
            whyItMatters: '床位、急救接收能力和院内排队状态尚未接入，确认前需取得医院接收回传。',
            confirmWith: '医疗协同负责人 / 医院接收回传',
          },
        ],
        recommendation: {
          actionId: 'select-dispatch-option',
          action: `先联系 ${recommended.optionLabel} 确认接收`,
          rationale: recommendedAnalysis.benefit,
          impact: '取得接收回传并经人工确认后，才修改接收医院并生成新任务包；原任务包不会被自动下发。',
          approvalRequired: true,
        },
        options: optionRows(event, exception),
        sources: [
          { id: 'workflow-feedback', label: '当前页面执行回传' },
          { id: 'workflow-task-package', label: `人工批准任务包 v${event.session.planVersion}` },
          ...comparisonSources(),
        ],
        followUps: [`选择${recommended.optionLabel}形成待确认修改`],
      },
    },
  }
}
