/**
 * 「刷新状态」按钮反馈状态机单测（node --test，经 scripts/run-tests.mjs 打包）。
 *
 * 守住四件事（对应 refreshFeedback.ts 头部的约束）：
 *   ① busy 有下限时长：请求太快也不会「转圈闪一帧」——settle 早到则暂存，
 *      等 tick 到点才进 done。
 *   ② done 只保持 holdMs：过期自动回 idle（刷新不是持续状态，常驻会变噪音）。
 *   ③ 相位自身防并发：busy 中重复 start 被忽略；非 busy 收到 settle 被忽略
 *      （于是晚到的旧结果不可能提前结束新一次点击的相位）。
 *   ④ 展示口径（转圈/勾/叉 + 文案键 + 禁用态）由 refreshButtonView 决定。
 *
 * 时间全部显式传入（模块不读时钟），所以这里不需要 mock 定时器。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  REFRESH_DONE_HOLD_MS,
  REFRESH_IDLE,
  REFRESH_MIN_BUSY_MS,
  isRefreshBusy,
  nextRefreshFeedback,
  refreshButtonView,
  type RefreshFeedbackState,
} from '../src/refreshFeedback.ts'

/** 便捷：造一个「已点击」的状态（默认 T0=1000 起）。 */
const started = (now = 1000, minBusyMs?: number): RefreshFeedbackState =>
  nextRefreshFeedback(REFRESH_IDLE, { type: 'start', now, minBusyMs })

test('初始态是 idle，不在忙，按钮显示原文案且可用', () => {
  assert.equal(REFRESH_IDLE.phase, 'idle')
  assert.equal(isRefreshBusy(REFRESH_IDLE), false)
  assert.equal(REFRESH_IDLE.result, null)
  const v = refreshButtonView(REFRESH_IDLE)
  assert.equal(v.labelKey, 'refreshStatus')
  assert.equal(v.icon, 'none')
  assert.equal(v.disabled, false)
})

test('start → busy：按钮转圈 + 禁用 + 文案「正在刷新」', () => {
  const s = started()
  assert.equal(s.phase, 'busy')
  assert.equal(isRefreshBusy(s), true)
  // 进入 busy 时结果必须清空（上一次的「已刷新」不能带过来）
  assert.equal(s.result, null)
  assert.equal(s.pendingResult, null)
  const v = refreshButtonView(s)
  assert.equal(v.labelKey, 'refreshStatusBusy')
  assert.equal(v.icon, 'spinner')
  assert.equal(v.disabled, true, '刷新中必须禁用，防连点')
  assert.equal(v.live, true)
})

test('成功：过 minBusy 后 settle → done(ok) → 按钮显示勾 → 过期回 idle', () => {
  const s0 = started(1000)
  const s1 = nextRefreshFeedback(s0, { type: 'settle', ok: true, now: 1000 + REFRESH_MIN_BUSY_MS })
  assert.equal(s1.phase, 'done')
  assert.equal(s1.result, 'ok')
  const v = refreshButtonView(s1)
  assert.equal(v.labelKey, 'refreshStatusDone')
  assert.equal(v.icon, 'check')
  assert.equal(v.disabled, false, '结束态应恢复可点')
  // 未过期：仍是 done
  const s2 = nextRefreshFeedback(s1, { type: 'tick', now: s1.finishAt - 1 })
  assert.equal(s2.phase, 'done')
  // 到点：回 idle
  const s3 = nextRefreshFeedback(s2, { type: 'tick', now: s1.finishAt })
  assert.equal(s3.phase, 'idle')
  assert.equal(s3.result, null)
})

test('失败也走 done 相位：按钮显示叉 + 文案「刷新失败」（不能静默回 idle）', () => {
  const s0 = started(1000)
  const s1 = nextRefreshFeedback(s0, { type: 'settle', ok: false, now: 2000 })
  assert.equal(s1.phase, 'done')
  assert.equal(s1.result, 'fail')
  const v = refreshButtonView(s1)
  assert.equal(v.labelKey, 'refreshStatusFail')
  assert.equal(v.icon, 'cross')
})

test('① 请求太快：settle 早到则留在 busy，tick 到下限才进 done', () => {
  const s0 = started(1000) // 下限 = 1000 + 420
  // 50ms 就返回了——此时直接进 done 会让动画闪一帧，所以先暂存
  const s1 = nextRefreshFeedback(s0, { type: 'settle', ok: true, now: 1050 })
  assert.equal(s1.phase, 'busy', '未到下限仍应停在 busy')
  assert.equal(s1.pendingResult, 'ok', '结果应被暂存')
  assert.equal(s1.result, null, '暂存期间不得暴露结果（否则按钮会跳文案）')

  // 还没到点：不动
  const s2 = nextRefreshFeedback(s1, { type: 'tick', now: 1400 })
  assert.equal(s2.phase, 'busy')

  // 到点：转 done
  const s3 = nextRefreshFeedback(s2, { type: 'tick', now: 1420 })
  assert.equal(s3.phase, 'done')
  assert.equal(s3.result, 'ok')
  assert.equal(s3.pendingResult, null)
})

test('① busy 期间 tick 而结果还没到：不得进 done', () => {
  const s0 = started(1000)
  const s1 = nextRefreshFeedback(s0, { type: 'tick', now: 9999 })
  assert.equal(s1.phase, 'busy', '没有结果就不该结束')
})

test('① busy 有下限：转圈至少活 420ms（下限内不会进 done）', () => {
  const s0 = started(1000)
  const early = nextRefreshFeedback(s0, { type: 'settle', ok: true, now: 1000 + REFRESH_MIN_BUSY_MS - 1 })
  assert.equal(early.phase, 'busy', `${REFRESH_MIN_BUSY_MS}ms 内不得结束`)
  const ontime = nextRefreshFeedback(s0, { type: 'settle', ok: true, now: 1000 + REFRESH_MIN_BUSY_MS })
  assert.equal(ontime.phase, 'done', '正好到下限就该结束')
})

test('③ busy 中重复 start 被忽略（不会重置计时导致动画卡住）', () => {
  const s0 = started(1000)
  const s1 = nextRefreshFeedback(s0, { type: 'start', now: 1100 })
  assert.equal(s1.phase, 'busy')
  assert.equal(s1.startedAt, 1000, '重复 start 不得重置起点')
  assert.equal(s1.minBusyMs, REFRESH_MIN_BUSY_MS)
})

test('③ 晚到的第一次结果：落到已 done 的相位上被忽略（不提前结束/不倒退）', () => {
  // 第一次点击 → 结果按时返回 → done(ok)
  const s0 = started(1000)
  const s1 = nextRefreshFeedback(s0, { type: 'settle', ok: true, now: 2000 })
  assert.equal(s1.phase, 'done')
  // 此时第二次点击（用户在 done 保持期内又点了一下）
  const s2 = nextRefreshFeedback(s1, { type: 'start', now: 2100 })
  assert.equal(s2.phase, 'busy')
  assert.equal(s2.result, null, '新一轮开始必须清掉上一轮的结局')
  // 第一轮若有「晚到」的重复 settle 落在 busy 上：会正常结算，
  // 但绝不会出现 result 保留旧值这种串味（上面已断言 result=null）
  assert.equal(s2.pendingResult, null)
})

test('③ 非 busy 相位收到 settle：忽略（无进行中的刷新）', () => {
  const s1 = nextRefreshFeedback(REFRESH_IDLE, { type: 'settle', ok: true, now: 5000 })
  assert.equal(s1.phase, 'idle')
  assert.equal(s1.result, null)
})

test('idle 相位 tick 无副作用', () => {
  const s1 = nextRefreshFeedback(REFRESH_IDLE, { type: 'tick', now: 99999 })
  assert.equal(s1.phase, 'idle')
})

test('done 保持期内 tick 不动，过期那一刻才回 idle（边界）', () => {
  const s0 = started(1000)
  const s1 = nextRefreshFeedback(s0, { type: 'settle', ok: true, now: 2000, holdMs: 100 })
  assert.equal(s1.finishAt, 2100)
  assert.equal(nextRefreshFeedback(s1, { type: 'tick', now: 2099 }).phase, 'done')
  assert.equal(nextRefreshFeedback(s1, { type: 'tick', now: 2100 }).phase, 'idle')
})

test('常量与文档一致（下限 420ms / 保持 1400ms）', () => {
  assert.equal(REFRESH_MIN_BUSY_MS, 420)
  assert.equal(REFRESH_DONE_HOLD_MS, 1400)
})

test('holdMs 可覆盖', () => {
  const s0 = started(1000)
  const s1 = nextRefreshFeedback(s0, { type: 'settle', ok: true, now: 2000, holdMs: 10 })
  assert.equal(s1.finishAt, 2010)
  assert.equal(nextRefreshFeedback(s1, { type: 'tick', now: 2010 }).phase, 'idle')
})

test('minBusyMs 可覆盖为 0：settle 立即进 done（快速路径）', () => {
  const s0 = nextRefreshFeedback(REFRESH_IDLE, { type: 'start', now: 1000, minBusyMs: 0 })
  const s1 = nextRefreshFeedback(s0, { type: 'settle', ok: true, now: 1000 })
  assert.equal(s1.phase, 'done')
  assert.equal(s1.result, 'ok')
})

test('连续两轮互不串味（done→idle→busy→done fail）', () => {
  let s = started(1000)
  s = nextRefreshFeedback(s, { type: 'settle', ok: true, now: 2000 })
  s = nextRefreshFeedback(s, { type: 'tick', now: s.finishAt })
  assert.equal(s.phase, 'idle')
  assert.equal(s.finishAt, 0, '回 idle 应清掉 finishAt')
  assert.equal(s.startedAt, 0)
  s = nextRefreshFeedback(s, { type: 'start', now: 9999 })
  s = nextRefreshFeedback(s, { type: 'settle', ok: false, now: 9999 + REFRESH_MIN_BUSY_MS })
  assert.equal(s.phase, 'done')
  assert.equal(s.result, 'fail')
})

test('回归：回 idle 用的是同一份 REFRESH_IDLE（字段不留残影）', () => {
  const s0 = started(5000, 0)
  const s1 = nextRefreshFeedback(s0, { type: 'settle', ok: true, now: 5000, holdMs: 1 })
  const s2 = nextRefreshFeedback(s1, { type: 'tick', now: 5001 })
  assert.deepEqual(s2, REFRESH_IDLE)
})
