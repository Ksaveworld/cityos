const PRIORITY_EVENT_IDS = ['ev-traffic-zhongshan', 'ev-medical-panfu'] as const

export function orderDispatchEventIds(eventIds: string[], selectedEventId: string | null) {
  const sourceOrder = new Map(eventIds.map((eventId, index) => [eventId, index]))
  const priority = new Map<string, number>(PRIORITY_EVENT_IDS.map((eventId, index) => [eventId, index]))
  return [...eventIds].sort((left, right) => {
    const leftPriority = priority.get(left)
    const rightPriority = priority.get(right)
    if (leftPriority !== undefined || rightPriority !== undefined) {
      if (leftPriority === undefined) return 1
      if (rightPriority === undefined) return -1
      return leftPriority - rightPriority
    }
    if (left === selectedEventId) return -1
    if (right === selectedEventId) return 1
    return (sourceOrder.get(left) ?? 0) - (sourceOrder.get(right) ?? 0)
  })
}
