import type { CityChatDispatchSkill, CityChatEvidence, CityChatResponse } from '../chat/chatContract'
import type { TaskDispatchOverride } from '../workflow/types'
import {
  resolveDispatchOptionAnalysis,
  type ActiveDispatchEvent,
  type DispatchException,
  type DispatchOptionAnalysis,
} from './activeEventDispatchModel.ts'
import { getLinkedDispatchMapConfig, getLinkedDispatchMapOption } from './linkedDispatchMapConfig.ts'

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

function usesLegacyDispatchLanguage(event: ActiveDispatchEvent) {
  return getLinkedDispatchMapConfig(event.id) === null
}

function linkedDispatchLanguage(event: ActiveDispatchEvent) {
  if (event.fixture.id === 'police') {
    return {
      arrangement: '外围疏导安排',
      candidate: '候选疏导单元',
      stateLabel: '候选单元实时状态',
      confirmWith: '站区外围协调负责人 / 备用疏导单元签收回传',
      actionVerb: '核实可用与签收条件',
    }
  }
  return {
    arrangement: '重点分区补位安排',
    candidate: '候选保障单元',
    stateLabel: '候选岗位实时状态',
    confirmWith: '现场总协调 / 重点分区负责人回传',
    actionVerb: '核实到位与分区覆盖条件',
  }
}

function comparisonEvidence(
  event: ActiveDispatchEvent,
  option: TaskDispatchOverride,
  analysis: DispatchOptionAnalysis,
) {
  const evidence: CityChatEvidence[] = []
  if (analysis.stateReason) {
    evidence.push({
      label: '候选接收状态',
      value: analysis.stateReason,
      kind: 'simulated',
      sourceIds: ['dispatch-candidate-state'],
    })
  }
  if (analysis.etaReason) {
    evidence.push({
      label: '演示 ETA 联络顺序',
      value: analysis.etaReason,
      kind: 'simulated',
      sourceIds: ['dispatch-facility-eta-demo'],
    })
  }
  const linkedOption = getLinkedDispatchMapOption(event.id, option.optionId)
  if (linkedOption) {
    evidence.push(
      {
        label: '候选资源状态',
        value: linkedOption.resourceState,
        kind: 'simulated',
        sourceIds: ['dispatch-linked-resource-state'],
      },
      {
        label: '候选资源 ETA',
        value: `约 ${linkedOption.etaMinutes.toFixed(1)} 分钟（演示估算）；${linkedOption.recommendationReason}`,
        kind: 'simulated',
        sourceIds: ['dispatch-linked-resource-eta'],
      },
    )
  }
  return evidence
}

function comparisonSources(event: ActiveDispatchEvent) {
  if (getLinkedDispatchMapConfig(event.id)) {
    return [
      { id: 'dispatch-linked-resource-state', label: '候选资源状态（模拟、待核实）' },
      { id: 'dispatch-linked-resource-eta', label: '候选资源 ETA（演示估算）' },
    ]
  }
  return [
    { id: 'dispatch-candidate-state', label: '当前候选接收状态（场景台账）' },
    { id: 'dispatch-facility-eta-demo', label: '候选医院 ETA（演示估算）' },
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
    const hospitalDispatch = usesLegacyDispatchLanguage(event)
    const linkedLanguage = linkedDispatchLanguage(event)
    return {
      proposedOptionId: selectedOption.optionId,
      response: {
        ...responseBase(event, requestId, contextVersion, 'dispatch_draft'),
        answer: {
          status: isRecommended ? 'answered' : 'needs_confirmation',
          title: isRecommended
            ? `已形成“${selectedOption.optionLabel}”待确认修改`
            : `已保留“${selectedOption.optionLabel}”非首选待确认修改`,
          directAnswer: hospitalDispatch
            ? isRecommended
              ? `已将“${selectedOption.optionLabel}”设为本次资源调整候选。系统不会直接下发；取得医院接收回传并由人工确认后，才会生成 v${event.session.planVersion + 1} 任务包并跳转到任务下发页。`
              : `已保留“${selectedOption.optionLabel}”作为人工选择，但当前比较结果不支持把它作为第一联络顺序。请先取得新的医院接收回传；系统不会直接下发，人工确认后才会生成 v${event.session.planVersion + 1} 任务包。`
            : isRecommended
              ? `已将“${selectedOption.optionLabel}”设为本次${linkedLanguage.candidate}草案。系统不会直接下发；${linkedLanguage.actionVerb}并由人工确认后，才会生成 v${event.session.planVersion + 1} 任务包并跳转到任务下发页。`
              : `已保留“${selectedOption.optionLabel}”作为人工选择；当前预设顺序更倾向另一候选，但不会自动替换。请先${linkedLanguage.actionVerb}；系统不会自动批准，也不会自动下发。人工确认后才会生成 v${event.session.planVersion + 1} 任务包。`,
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
            ...comparisonEvidence(event, selectedOption, analysis),
          ],
          unknowns: [
            hospitalDispatch
              ? {
                  label: '实时接收能力',
                  whyItMatters: analysis.tradeoff,
                  confirmWith: '医疗协同负责人 / 医院接收回传',
                }
              : {
                  label: linkedLanguage.stateLabel,
                  whyItMatters: analysis.tradeoff,
                  confirmWith: linkedLanguage.confirmWith,
                },
          ],
          recommendation: {
            actionId: 'apply-dispatch-resolution',
            action: hospitalDispatch
              ? isRecommended
                ? `取得接收回传后生成 ${selectedOption.optionLabel} 调整任务包`
                : `补充接收确认后再生成 ${selectedOption.optionLabel} 调整任务包`
              : `${linkedLanguage.actionVerb}后生成 ${selectedOption.optionLabel} 调整任务包`,
            rationale: `${analysis.benefit}${analysis.tradeoff}`,
            impact: `任务包版本将从 v${event.session.planVersion} 更新为 v${event.session.planVersion + 1}，原${hospitalDispatch ? '接收安排' : linkedLanguage.arrangement}被替换。`,
            approvalRequired: true,
          },
          options: optionRows(event, exception),
          sources: [
            { id: 'workflow-feedback', label: '当前页面执行回传' },
            { id: 'workflow-task-package', label: `人工批准任务包 v${event.session.planVersion}` },
            ...comparisonSources(event),
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
  const hospitalDispatch = usesLegacyDispatchLanguage(event)
  const linkedLanguage = linkedDispatchLanguage(event)
  return {
    response: {
      ...responseBase(event, requestId, contextVersion, intentTag === 'resource_compare' ? 'resource_compare' : 'dispatch_triage'),
      answer: {
        status: 'answered',
        title: hospitalDispatch
          ? `${exception.title}：需要重新确认接收安排`
          : `${exception.title}：需要重新确认${linkedLanguage.candidate}`,
        directAnswer: hospitalDispatch
          ? `当前任务包的异常来自新的执行回传：原接收安排不能继续沿用。系统比较结果：${recommendedAnalysis.benefit}这只决定接收确认顺序，不代表医院已确认接收。`
          : `当前任务包的异常来自新的执行回传：原${linkedLanguage.arrangement}不能继续沿用。当前预设顺序先展示 ${recommended.optionLabel}，依据为：${recommendedAnalysis.benefit}这只是待核实的草案顺序，不代表资源已签收或已下发。`,
        evidence: [
          {
            label: '异常触发',
            value: exception.detail,
            kind: 'simulated',
            sourceIds: ['workflow-feedback'],
          },
          {
            label: hospitalDispatch ? '当前医疗协同单元' : `当前${linkedLanguage.candidate}`,
            value: hospitalDispatch
              ? `${recommended.vehicles}；两种医院选择均保留这一任务包资源，只改变接收点。`
              : `${recommended.vehicles}；候选只改变${linkedLanguage.arrangement}，不表示单元已签收或已开始执行。`,
            kind: 'simulated',
            sourceIds: ['workflow-task-package'],
          },
          ...comparisonEvidence(event, recommended, recommendedAnalysis),
        ],
        unknowns: [
          hospitalDispatch
            ? {
                label: '医院实时状态',
                whyItMatters: '床位、急救接收能力和院内排队状态尚未接入，确认前需取得医院接收回传。',
                confirmWith: '医疗协同负责人 / 医院接收回传',
              }
            : {
                label: linkedLanguage.stateLabel,
                whyItMatters: '页面未接入资源实时可用、岗位占用或签收状态，确认前必须人工核实。',
                confirmWith: linkedLanguage.confirmWith,
              },
        ],
        recommendation: {
          actionId: 'select-dispatch-option',
          action: hospitalDispatch
            ? `先联系 ${recommended.optionLabel} 确认接收`
            : `先联系 ${recommended.optionLabel} 并${linkedLanguage.actionVerb}`,
          rationale: recommendedAnalysis.benefit,
          impact: hospitalDispatch
            ? '取得接收回传并经人工确认后，才修改接收医院并生成新任务包；原任务包不会被自动下发。'
            : `取得资源状态与签收条件回传并经人工确认后，才更新${linkedLanguage.arrangement}并生成新任务包；任务不会被自动下发。`,
          approvalRequired: true,
        },
        options: optionRows(event, exception),
        sources: [
          { id: 'workflow-feedback', label: '当前页面执行回传' },
          { id: 'workflow-task-package', label: `人工批准任务包 v${event.session.planVersion}` },
          ...comparisonSources(event),
        ],
        followUps: [`选择${recommended.optionLabel}形成待确认修改`],
      },
    },
  }
}
