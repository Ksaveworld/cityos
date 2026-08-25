export const KNOWLEDGE_RAIL_STORAGE_KEY = 'cityos.knowledgeRailWidth'
export const LEGACY_KNOWLEDGE_RAIL_STORAGE_KEY = 'cityos.knowledgeConversationRailWidth'
export const KNOWLEDGE_RAIL_DEFAULT_WIDTH = 240
export const KNOWLEDGE_RAIL_MIN_WIDTH = 212
export const KNOWLEDGE_RAIL_MAX_WIDTH = 360
export const KNOWLEDGE_RAIL_KEYBOARD_STEP = 16

export function readKnowledgeRailWidth() {
  if (typeof window === 'undefined') return KNOWLEDGE_RAIL_DEFAULT_WIDTH
  const stored = Number(window.localStorage.getItem(KNOWLEDGE_RAIL_STORAGE_KEY) ?? window.localStorage.getItem(LEGACY_KNOWLEDGE_RAIL_STORAGE_KEY))
  return Number.isFinite(stored) && stored > 0 ? stored : KNOWLEDGE_RAIL_DEFAULT_WIDTH
}

export function clampKnowledgeRailWidth(width: number, containerWidth: number) {
  const responsiveMax = Math.min(KNOWLEDGE_RAIL_MAX_WIDTH, Math.max(KNOWLEDGE_RAIL_MIN_WIDTH, Math.floor(containerWidth * 0.42)))
  return Math.min(Math.max(Math.round(width), KNOWLEDGE_RAIL_MIN_WIDTH), responsiveMax)
}
