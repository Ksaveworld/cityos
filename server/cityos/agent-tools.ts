import { randomUUID } from 'node:crypto'

import type {
  CityChatContextFact,
  CityChatContextSource,
} from '../../src/components/dashboard/chat/chatContract.js'
import { getCityosDatabase } from './db.ts'
import { createMedicalService } from './medical-service.ts'
import type {
  BoardResponse,
  ContextResponse,
  DecisionLineageEntry,
  MedicalService,
} from './types.ts'

type Environment = Record<string, string | undefined>
type ReadService = Pick<MedicalService, 'getContext' | 'getBoard' | 'getDecisionLineage'>

export type CityosReadToolName =
  | 'get_incident_context'
  | 'get_dispatch_board'
  | 'get_decision_lineage'

interface FunctionToolDefinition {
  type: 'function'
  function: {
    name: CityosReadToolName
    description: string
    parameters: {
      type: 'object'
      additionalProperties: false
      properties: Record<string, never>
    }
  }
}

export const CITYOS_READ_TOOL_DEFINITIONS: FunctionToolDefinition[] = [
  {
    type: 'function',
    function: {
      name: 'get_incident_context',
      description: '读取当前 CityOS 医疗联动事件及其相关接收点状态。只读，不改变事件或资源。',
      parameters: { type: 'object', additionalProperties: false, properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_dispatch_board',
      description: '读取当前事件的调度台快照，包括方案、资源、路线、动作和任务包。只读。',
      parameters: { type: 'object', additionalProperties: false, properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_decision_lineage',
      description: '读取当前事件最近的决策谱系，用于解释事实、方案和动作如何演变。只读。',
      parameters: { type: 'object', additionalProperties: false, properties: {} },
    },
  },
]

const READ_TOOL_NAMES = new Set<CityosReadToolName>(
  CITYOS_READ_TOOL_DEFINITIONS.map((tool) => tool.function.name),
)

export interface CityosReadToolInvocationMeta {
  requestId: string
  conversationId: string
  messageId: string
}

export interface CityosReadToolCallRecord extends CityosReadToolInvocationMeta {
  incidentId: string
  toolName: CityosReadToolName
  ok: boolean
  durationMs: number
  errorCode?: string
}

export interface CityosReadToolResult {
  ok: true
  toolName: CityosReadToolName
  incidentId: string
  data: unknown
  facts: CityChatContextFact[]
  sources: CityChatContextSource[]
}

export interface CityosReadToolRuntime {
  definitions: FunctionToolDefinition[]
  invoke(toolName: CityosReadToolName, meta: CityosReadToolInvocationMeta): Promise<CityosReadToolResult>
}

interface RuntimeOptions {
  incidentId: string
  service: ReadService
  recordCall?: (record: CityosReadToolCallRecord) => Promise<void>
}

function source(
  toolName: CityosReadToolName,
  incidentId: string,
  simulated: boolean,
): CityChatContextSource {
  const labels: Record<CityosReadToolName, string> = {
    get_incident_context: 'CityOS 事件上下文',
    get_dispatch_board: 'CityOS 调度台只读模型',
    get_decision_lineage: 'CityOS 决策谱系',
  }
  return {
    id: `cityos-tool:${toolName}:${incidentId}`,
    label: `${labels[toolName]}${simulated ? '（模拟）' : ''}`,
    type: simulated ? 'simulated' : 'page',
  }
}

function fact(
  id: string,
  label: string,
  value: string,
  kind: CityChatContextFact['kind'],
  sourceId: string,
): CityChatContextFact {
  return { id, label, value, kind, sourceIds: [sourceId] }
}

function contextResult(toolName: CityosReadToolName, context: ContextResponse): CityosReadToolResult {
  const simulated = context.incident.mode === 'demo'
  const toolSource = source(toolName, context.incident.id, simulated)
  const kind = simulated ? 'simulated' : 'confirmed'
  return {
    ok: true,
    toolName,
    incidentId: context.incident.id,
    data: context,
    sources: [toolSource],
    facts: [
      fact(
        `tool:context:${context.incident.id}:incident`,
        '当前事件',
        `${context.incident.title}；状态 ${context.incident.status}；事实版本 ${context.incident.currentVersion}；方案版本 ${context.incident.currentPlanVersion}`,
        kind,
        toolSource.id,
      ),
      ...context.facilities.map((facility) => fact(
        `tool:context:${context.incident.id}:facility:${facility.id}`,
        `接收点：${facility.name}`,
        `状态 ${facility.status}；状态版本 ${facility.statusVersion}`,
        kind,
        toolSource.id,
      )),
    ],
  }
}

function boardResult(toolName: CityosReadToolName, board: BoardResponse): CityosReadToolResult {
  const simulated = board.incident.mode === 'demo'
    || board.units.some((unit) => unit.simulated)
    || board.taskPackages.some((task) => task.simulated)
  const toolSource = source(toolName, board.incident.id, simulated)
  const kind = simulated ? 'simulated' : 'confirmed'
  const plan = board.planVersion
    ? `版本 ${board.planVersion.version}，状态 ${board.planVersion.status}${board.planVersion.blockedReason ? `，原因 ${board.planVersion.blockedReason}` : ''}`
    : '当前没有方案版本'
  const actions = board.actionRuns.length === 0
    ? '当前没有动作运行记录'
    : board.actionRuns.map((run) => `${run.actionType}:${run.status}@v${run.planVersion}`).join('；')
  return {
    ok: true,
    toolName,
    incidentId: board.incident.id,
    data: board,
    sources: [toolSource],
    facts: [
      fact(`tool:board:${board.incident.id}:plan`, '当前方案', plan, kind, toolSource.id),
      fact(
        `tool:board:${board.incident.id}:resources`,
        '调度资源',
        `资源 ${board.units.length} 个；接收点 ${board.facilities.length} 个；任务包 ${board.taskPackages.length} 个`,
        kind,
        toolSource.id,
      ),
      fact(
        `tool:board:${board.incident.id}:routes`,
        '调度路线',
        `候选路线 ${board.routes.filter((route) => route.kind === 'plan_candidate').length} 条；已下发路线 ${board.routes.filter((route) => route.kind === 'issued_task').length} 条`,
        kind,
        toolSource.id,
      ),
      fact(`tool:board:${board.incident.id}:actions`, '动作状态', actions, kind, toolSource.id),
    ],
  }
}

function lineageResult(
  toolName: CityosReadToolName,
  incidentId: string,
  entries: DecisionLineageEntry[],
): CityosReadToolResult {
  const items = entries.slice(-20)
  const toolSource = source(toolName, incidentId, false)
  const latest = items.at(-1)
  return {
    ok: true,
    toolName,
    incidentId,
    data: { total: entries.length, items },
    sources: [toolSource],
    facts: [
      fact(
        `tool:lineage:${incidentId}:summary`,
        '决策谱系',
        `共 ${entries.length} 条记录；本次返回最近 ${items.length} 条`,
        'confirmed',
        toolSource.id,
      ),
      fact(
        `tool:lineage:${incidentId}:latest`,
        '最近谱系事件',
        latest ? `${latest.eventType}；行为主体 ${latest.actorId}；时间 ${latest.createdAt}` : '当前没有谱系记录',
        'confirmed',
        toolSource.id,
      ),
    ],
  }
}

export function createCityosReadToolRuntime({
  incidentId,
  service,
  recordCall,
}: RuntimeOptions): CityosReadToolRuntime {
  const scopedIncidentId = incidentId.trim()
  if (!scopedIncidentId) throw new Error('CityOS Agent 缺少服务器事件范围')

  return {
    definitions: CITYOS_READ_TOOL_DEFINITIONS,
    async invoke(toolName, meta) {
      if (!READ_TOOL_NAMES.has(toolName)) {
        throw new Error(`未注册只读工具：${String(toolName)}`)
      }
      const startedAt = Date.now()
      try {
        let result: CityosReadToolResult
        switch (toolName) {
          case 'get_incident_context':
            result = contextResult(toolName, await service.getContext(scopedIncidentId))
            break
          case 'get_dispatch_board':
            result = boardResult(toolName, await service.getBoard(scopedIncidentId))
            break
          case 'get_decision_lineage': {
            const lineage = await service.getDecisionLineage(scopedIncidentId)
            result = lineageResult(toolName, scopedIncidentId, lineage.items)
            break
          }
        }
        await recordCall?.({
          ...meta,
          incidentId: scopedIncidentId,
          toolName,
          ok: true,
          durationMs: Date.now() - startedAt,
        })
        return result
      } catch (error) {
        await recordCall?.({
          ...meta,
          incidentId: scopedIncidentId,
          toolName,
          ok: false,
          durationMs: Date.now() - startedAt,
          errorCode: error instanceof Error ? error.name : 'TOOL_READ_FAILED',
        })
        throw error
      }
    },
  }
}

export function createConfiguredCityosReadToolRuntime(env: Environment): CityosReadToolRuntime {
  const incidentId = env.CITYOS_AGENT_INCIDENT_ID?.trim() || 'ev-medical-panfu'
  const sql = getCityosDatabase(env)
  return createCityosReadToolRuntime({
    incidentId,
    service: createMedicalService(sql),
    recordCall: async (record) => {
      await sql`
        INSERT INTO cityos.decision_lineage (
          id, incident_id, event_type, actor_id, source_ids, detail
        ) VALUES (
          ${randomUUID()}, ${record.incidentId},
          ${record.ok ? 'agent.tool.read' : 'agent.tool.failed'},
          'cityos-chat-agent', ${sql.json([])},
          ${sql.json({
            toolName: record.toolName,
            requestId: record.requestId,
            conversationId: record.conversationId,
            messageId: record.messageId,
            ok: record.ok,
            durationMs: record.durationMs,
            ...(record.errorCode ? { errorCode: record.errorCode } : {}),
          })}
        )
      `
    },
  })
}

