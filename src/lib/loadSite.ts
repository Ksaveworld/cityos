/**
 * 站点数据的取数层。engine 保持纯函数，副作用集中在这里。
 */

import { parseSite, type SiteInfo, type SiteRecord } from '@/engine/site'

let cached: Promise<SiteInfo> | null = null

/** 全应用只取一次。失败直接抛，不给默认值兜底 */
export function loadSite(): Promise<SiteInfo> {
  if (!cached) {
    cached = fetch('/data/liwan_site.json')
      .then((r) => {
        if (!r.ok) throw new Error(`liwan_site.json 取不到，HTTP ${r.status}`)
        return r.json() as Promise<SiteRecord>
      })
      .then(parseSite)
  }
  return cached
}
