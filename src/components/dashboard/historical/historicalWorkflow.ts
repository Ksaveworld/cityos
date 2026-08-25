import { findFixtureByScenarioId } from '../workflow/fixtures'
import { createWorkflowSession } from '../workflow/state'
import type { BriefItem, DomainFixture, TaskAssignment, WorkflowSession } from '../workflow/types'

import { HISTORICAL_REVIEW_CASES, type HistoricalReviewCaseId } from './reviewCases'

type HistoricalAssignmentDetail = Pick<TaskAssignment, 'location' | 'personnel' | 'vehicles' | 'eta'>

const HISTORICAL_ASSIGNMENT_DETAILS: Record<HistoricalReviewCaseId, HistoricalAssignmentDetail[]> = {
  'hc-liwan-516': [
    { location: '人民南路 93 号东侧集结点', personnel: '30 人', vehicles: '5 辆（水罐 3 / 云梯 1 / 指挥 1）', eta: '约 8 分钟（估算）' },
    { location: '人民南路与一德路关键路口', personnel: '4 人', vehicles: '2 组摩托', eta: '约 9 分钟（估算）' },
    { location: '人民南路 93 号南侧接应点', personnel: '6 人', vehicles: '2 辆救护车', eta: '约 10 分钟（估算）' },
    { location: '人民南路 93 号场址入口', personnel: '6 人', vehicles: '1 辆现场保障车', eta: '约 10 分钟（估算）' },
  ],
  'hc-station-2015': [
    { location: '广州火车站站外广场核心响应区', personnel: '2 组响应力量', vehicles: '2 辆响应车', eta: '约 8 分钟（估算）' },
    { location: '站外广场外围出入口', personnel: '1 组站区协同', vehicles: '1 辆巡控车', eta: '约 9 分钟（估算）' },
    { location: '站外广场南侧接应通道', personnel: '1 组医疗接应', vehicles: '1 辆救护车', eta: '约 10 分钟（估算）' },
  ],
}

function briefItems(
  values: string[],
  labelPrefix: string,
  dataLabel: BriefItem['dataLabel'],
  source: string,
  status: string,
): BriefItem[] {
  return values.map((value, index) => ({
    label: `${labelPrefix} ${index + 1}`,
    value,
    source,
    status,
    dataLabel,
  }))
}

function historicalTasks(caseId: HistoricalReviewCaseId): TaskAssignment[] {
  const reviewCase = HISTORICAL_REVIEW_CASES[caseId]
  const assignmentDetails = HISTORICAL_ASSIGNMENT_DETAILS[caseId]
  return reviewCase.tasks.map((item, index) => {
    const detail = assignmentDetails[index]
    return {
      department: item.department,
      owner: `${item.department}协同负责人`,
      task: item.task,
      location: detail.location,
      window: item.timing,
      personnel: detail.personnel,
      vehicles: detail.vehicles,
      feedback: '签收、执行、异常与完成状态',
      contact: '系统任务包',
      eta: detail.eta,
    }
  })
}

export function createHistoricalWorkflowFixture(caseId: HistoricalReviewCaseId): DomainFixture {
  const reviewCase = HISTORICAL_REVIEW_CASES[caseId]
  const base = findFixtureByScenarioId(reviewCase.scenarioId)
  const knownTimeline = reviewCase.originalTimeline.filter((item) => item.known)

  return {
    ...base,
    isHistoricalCase: true,
    title: reviewCase.title,
    address: reviewCase.address,
    defaultOwner: base.defaultOwner.replace(/ · (?:演示|演示)$/, ''),
    dataNote: `${reviewCase.boundary} 未公开的资源、路线、签收与执行状态均为演示。`,
    inputFields: [
      { id: 'eventType', label: '历史案例', value: reviewCase.title },
      { id: 'location', label: '公开地点', value: reviewCase.address },
    ],
    plans: reviewCase.plans.map(({ resourceCost: _resourceCost, ...plan }) => plan),
    brief: {
      confirmed: briefItems(reviewCase.brief.evidence, '公开证据', '公开事实', '公开资料与案例来源', '已核验公开信息'),
      unknown: briefItems(reviewCase.brief.risks, '风险', '待核实', 'CityOS 历史研判', '仅进入反事实推演'),
      context: knownTimeline.map((item, index) => ({
        label: `公开时间锚点 ${index + 1}`,
        value: `${item.time} · ${item.label} · ${item.detail}`,
        source: '历史案例公开资料',
        status: '公开事实锚点',
        dataLabel: '公开事实' as const,
      })),
      gaps: briefItems(reviewCase.brief.gaps, '信息缺口', '待核实', '公开资料未披露', '禁止补造成历史事实'),
    },
    taskAssignments: historicalTasks(caseId),
    executionSteps: ['演示任务包生成', '演示送达与签收', '协同任务并行推进', '完成反事实推演'],
  }
}

export function createHistoricalWorkflowSession(caseId: HistoricalReviewCaseId): WorkflowSession {
  const fixture = createHistoricalWorkflowFixture(caseId)
  return {
    ...createWorkflowSession(fixture),
    inputValidated: true,
    stage: 'brief',
    selectedPlanId: fixture.plans[0].id,
  }
}

export function createInitialHistoricalWorkflowSessions(): Record<HistoricalReviewCaseId, WorkflowSession> {
  return {
    'hc-liwan-516': createHistoricalWorkflowSession('hc-liwan-516'),
    'hc-station-2015': createHistoricalWorkflowSession('hc-station-2015'),
  }
}
