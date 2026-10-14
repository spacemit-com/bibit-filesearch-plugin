/**
 * 「恢复默认」两步确认状态机单测（node --test，经 scripts/run-tests.mjs 打包）。
 *
 * 覆盖用户实际会走的路径：误点一次 → 撤销；确认 → 只开火一次；
 * 武装后改表单/成功/失败 → 回到空闲。
 *
 * 2026-09-09 用户反馈回归：武装态**不得**因时间流逝自动解除
 * （原实现 10s 超时，用户点一次去别处看，回来确认态就没了）。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'

import { RESET_IDLE, nextResetConfirm } from '../src/resetConfirm.ts'

test('初始状态是空闲', () => {
  assert.deepEqual(RESET_IDLE, { armed: false, fire: false })
})

test('第一次点击只进入确认态，不开火', () => {
  const s = nextResetConfirm(RESET_IDLE, 'click')
  assert.deepEqual(s, { armed: true, fire: false })
})

test('确认态再点一次才开火，且武装同时归位', () => {
  const armed = nextResetConfirm(RESET_IDLE, 'click')
  const fired = nextResetConfirm(armed, 'click')
  assert.deepEqual(fired, { armed: false, fire: true }, 'fire=true 且 armed=false')
})

test('开火后继续点击回到「进入确认态」，不会连续开火', () => {
  let s = nextResetConfirm(RESET_IDLE, 'click') // armed
  s = nextResetConfirm(s, 'click') // fire
  assert.equal(s.fire, true)
  s = nextResetConfirm(s, 'click')
  assert.deepEqual(s, { armed: true, fire: false }, '第二次开火后需重新武装')
})

test('取消 / 成功 / 编辑表单 都回到空闲', () => {
  const armed = nextResetConfirm(RESET_IDLE, 'click')
  for (const action of ['cancel', 'done', 'edit'] as const) {
    assert.deepEqual(nextResetConfirm(armed, action), RESET_IDLE, `${action} 应回到空闲`)
  }
})

test('确认条上的「取消」按钮：cancel 动作不得开火', () => {
  // 2026-09-09 追加：武装态下点提示条里的「取消」，只是退出确认态，绝不触发重置。
  const armed = nextResetConfirm(RESET_IDLE, 'click')
  const cancelled = nextResetConfirm(armed, 'cancel')
  assert.deepEqual(cancelled, RESET_IDLE)
  assert.equal(cancelled.fire, false, '取消绝不能开火')
  // 取消后回到空闲，需要重新点两次才会执行
  const rearmed = nextResetConfirm(cancelled, 'click')
  assert.deepEqual(rearmed, { armed: true, fire: false }, '取消后必须重新武装')
})

test('空闲态收到 cancel/done/edit 保持空闲（幂等）', () => {
  for (const action of ['cancel', 'done', 'edit'] as const) {
    assert.deepEqual(nextResetConfirm(RESET_IDLE, action), RESET_IDLE)
  }
})

test('回归：武装态不会因时间流逝自行解除（无 timeout 动作）', () => {
  const armed = nextResetConfirm(RESET_IDLE, 'click')
  // 用户点一次后去别处看，回来再点一次 —— 中间没有任何动作，状态必须还是 armed
  assert.deepEqual(armed, { armed: true, fire: false }, '武装态必须保持，等用户回来点第二次')
  // 传一个历史上存在过的 'timeout' 动作也不得解除（未知动作原样返回）
  const after = nextResetConfirm(armed, 'timeout' as never)
  assert.deepEqual(after, armed, '未知/已移除的动作不得改变武装态')
})
