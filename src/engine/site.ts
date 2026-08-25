/**
 * 站点信息。数据源是 data/processed/liwan_site.json，经 sync_public_data.py
 * 同步到 public/data/，运行时由 UI 层 fetch 后交给这里解析。
 *
 * 本文件按 CLAUDE.md 的约定保持纯函数，不 fetch、不读全局状态。
 * 取数在 src/lib/loadSite.ts。
 *
 * 原来 scenario.ts 里手抄了一份地址与坐标常量，两份数据会漂，已删。
 */

import type { LngLat, Timestamp } from './types'

/** liwan_site.json 的原始形状，字段名与脚本写出来的一致 */
export interface SiteRecord {
  name: string
  address: string
  center: [number, number]
  event: string
  /** YYYY-MM-DD */
  date: string
  /** HH:mm，官方公开口径 */
  alarm_time: string
  /** HH:mm，官方公开口径 */
  extinguished_time: string
  note: string
  /** 由 pin_site_building.py 钉死，前端按此匹配着火楼栋 */
  site_building_id: string
  /** 事发楼栋的层数是不是估算值。是的话界面要标 */
  site_building_levels_estimated: boolean
  site_building_pick_rule: string
}

export interface SiteInfo {
  name: string
  address: string
  center: LngLat
  district: string
  buildingId: string
  /** 事发楼栋层数为估算值时为 true，界面上必须标注 */
  buildingLevelsEstimated: boolean
  /** 接警时刻，Unix 秒。官方公开口径 */
  alarmAt: Timestamp
  /** 明火扑灭时刻，Unix 秒。官方公开口径 */
  extinguishedAt: Timestamp
  /** 首车到场未公开，这里只记两个官方锚点 */
  note: string
}

/** 荔湾区，从 address 里取不出来，写死在这里 */
const DISTRICT = '荔湾区'

/** 把 YYYY-MM-DD 与 HH:mm 按 GMT+8 折成 Unix 秒 */
export function toTimestamp(date: string, hhmm: string): Timestamp {
  const [y, m, d] = date.split('-').map(Number)
  const [hh, mm] = hhmm.split(':').map(Number)
  // Date.UTC 得到的是 UTC 秒，减 8 小时得到 GMT+8 同一墙钟时刻
  return Math.floor(Date.UTC(y, m - 1, d, hh - 8, mm) / 1000)
}

/** 纯解析。缺字段直接抛，宁可启动失败也不要静默用错数据 */
export function parseSite(raw: SiteRecord): SiteInfo {
  const required: Array<keyof SiteRecord> = [
    'name',
    'address',
    'center',
    'date',
    'alarm_time',
    'extinguished_time',
    'site_building_id',
  ]
  for (const k of required) {
    if (raw[k] === undefined || raw[k] === null) {
      throw new Error(`liwan_site.json 缺字段 ${String(k)}，先跑 pin_site_building.py`)
    }
  }

  return {
    name: raw.name,
    address: raw.address,
    center: raw.center,
    district: DISTRICT,
    buildingId: raw.site_building_id,
    buildingLevelsEstimated: raw.site_building_levels_estimated ?? true,
    alarmAt: toTimestamp(raw.date, raw.alarm_time),
    extinguishedAt: toTimestamp(raw.date, raw.extinguished_time),
    note: raw.note,
  }
}
