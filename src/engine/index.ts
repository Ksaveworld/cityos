/**
 * 推演引擎入口。
 *
 * 约定（见 CLAUDE.md「代码约定」）：
 * - 本目录下全部是纯函数，不依赖 React、不读全局状态
 * - 时间用 Unix 秒（number），坐标用 [lng, lat]
 *
 * 数据结构见 docs/接口契约.md。
 */

export * from './types'
export * from './site'
export * from './dispatch'
export * from './scenario'
export * from './routing'
