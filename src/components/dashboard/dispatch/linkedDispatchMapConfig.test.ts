import assert from 'node:assert/strict'
import test from 'node:test'

import {
  LINKED_DISPATCH_MAP_CONFIGS,
  findLinkedDispatchMapOption,
  getLinkedDispatchMapConfig,
} from './linkedDispatchMapConfig.ts'

test('110 and major deployment each expose two distinct map-linked candidates', () => {
  const police = LINKED_DISPATCH_MAP_CONFIGS['ev-police-station-delay']
  const major = LINKED_DISPATCH_MAP_CONFIGS['ev-major-tianhe']

  assert.deepEqual(police.options.map((option) => option.optionId), [
    'police-west-square',
    'police-huanshi-west',
  ])
  assert.deepEqual(major.options.map((option) => option.optionId), [
    'major-tianhe-support',
    'major-haizhu-mobile',
  ])
  assert.deepEqual(police.options.map((option) => option.routeRole), ['primary', 'secondary'])
  assert.deepEqual(major.options.map((option) => option.routeRole), ['primary', 'secondary'])

  const options = [...police.options, ...major.options]
  assert.equal(new Set(options.map((option) => option.optionId)).size, options.length)
  assert.equal(new Set(options.map((option) => option.pointLabel)).size, options.length)
  assert.equal(new Set(options.map((option) => option.routeLabel)).size, options.length)
})

test('candidate status, ETA, route and approval boundary stay explicit', () => {
  for (const config of Object.values(LINKED_DISPATCH_MAP_CONFIGS)) {
    for (const option of config.options) {
      assert.ok(option.etaMinutes > 0)
      assert.match(option.resourceState, /模拟/)
      assert.match(option.resourceState, /待核实/)
      assert.match(option.taskNote, /演示估算/)
      assert.match(option.taskNote, /人工确认后才生成新任务包版本/)
      assert.match(option.verificationNote, /核实/)
      assert.equal(option.dataOrigin.resourceState, '模拟、待核实')
      assert.equal(option.dataOrigin.eta, '演示估算、待核实')
      assert.equal(option.dataOrigin.route, '本地 OSM 静态路网计算')
      assert.equal(findLinkedDispatchMapOption(option.optionId), option)
    }
  }
})

test('current 110 uses a dedicated map while fire remains outside the linked config', () => {
  assert.equal(getLinkedDispatchMapConfig('ev-police-station-delay')?.mapVariant, 'police_current')
  assert.equal(getLinkedDispatchMapConfig('ev-major-tianhe')?.mapVariant, 'major')
  assert.equal(getLinkedDispatchMapConfig('ev-fire-finance'), null)
})
