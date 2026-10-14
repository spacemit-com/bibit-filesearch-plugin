/**
 * 「刷新状态」按钮的点击反馈状态机（纯函数，可单测）。
 *
 * 它做的工作（GET /health/deep + GET /api/scan/progress）在本机只要十几毫秒就返回，
 * 若无反馈则界面纹丝不动，无法分辨「点了没生效」还是「生效了但本来就是这样」。
 *
 * 本模块只做一件事：把「一次点击」映射成三个可见相位
 *
 *   idle ──start──▶ busy ──settle──▶ done ──tick──▶ idle
 *
 * 三条设计约束（都有单测守着）：
 *
 * ① **busy 有下限时长**（`minBusyMs`）。请求太快（毫秒级）会让转圈闪一帧就消失，
 *    看上去仍像「没反应」。所以 settle 到达时若还没到 `startedAt + minBusyMs`，
 *    状态**留在 busy** 并把结果暂存 `pendingResult`，等 tick 到点再转 done。
 *
 * ② **done 只保持一段时间**（`holdMs`，落成 `finishAt`）。刷新不是持续状态，
 *    常驻「已刷新」会变成噪音；保持约 1.4s 足够被看到，随后自动回 idle。
 *
 * ③ **不并发的保护靠相位本身，不靠 id**。按钮在 busy 期间是 disabled，
 *    状态机这一层再补一道：busy 中重复 `start` 被忽略、非 busy 收到 `settle`
 *    被忽略。于是「上一次的晚到结果」最多只能落到它自己的 busy 相位上，
 *    不可能把新一次点击的相位提前结束（用户连点两下时，第一下的结果先到、
 *    第二下的后到；第一下把 busy 转成 done，第二下的 settle 落到 done 上被忽略——
 *    不会出现「还在转圈却显示已刷新」，也不会出现「已经完成却又跳回转圈」）。
 *
 * 注意 `ok=false` 也走 done 相位（`result='fail'`）——失败必须可见，
 * 不能静默回到 idle 让用户误以为成功了。文案由调用方按 `result` 选词。
 *
 * 时间一律由调用方以 `now` 传入，模块自身不读时钟 ⇒ 单测无需 mock 定时器。
 */

/** busy 相位的下限时长（ms）：让转圈动画至少被看到一次。 */
export const REFRESH_MIN_BUSY_MS = 420

/** done 相位的保持时长（ms）：够看清一次，又不至于常驻成噪音。 */
export const REFRESH_DONE_HOLD_MS = 1400

export type RefreshPhase = 'idle' | 'busy' | 'done'

/** 本次刷新的结局；null = 还没有结果（idle 或请求在飞）。 */
export type RefreshResult = 'ok' | 'fail' | null

export interface RefreshFeedbackState {
  phase: RefreshPhase
  /** 本次 busy 相位的起点（ms 时间戳），用于算 minBusy 下限 */
  startedAt: number
  /** 本次 busy 相位的下限时长，随 start 传入（便于边界测试） */
  minBusyMs: number
  /** 请求已返回、但还在等 minBusy 用完；null = 结果还没到 */
  pendingResult: RefreshResult
  /** done 相位保持到此刻（ms 时间戳）；非 done 相位为 0 */
  finishAt: number
  /** 本次刷新的结局；idle / 进行中为 null */
  result: RefreshResult
}

export const REFRESH_IDLE: RefreshFeedbackState = {
  phase: 'idle',
  startedAt: 0,
  minBusyMs: REFRESH_MIN_BUSY_MS,
  pendingResult: null,
  finishAt: 0,
  result: null,
}

export type RefreshFeedbackAction =
  /** 用户点了按钮：开始一次刷新（busy 相位中会被忽略） */
  | { type: 'start'; now: number; minBusyMs?: number }
  /** 请求返回：只在 busy 相位生效，早于下限则暂存 */
  | { type: 'settle'; ok: boolean; now: number; holdMs?: number }
  /** 时间推进：负责 busy→done（过 minBusy）与 done→idle（过 finishAt） */
  | { type: 'tick'; now: number }

const toResult = (ok: boolean): RefreshResult => (ok ? 'ok' : 'fail')

/** 进入 done 相位（内部共用，保证 finishAt / pendingResult 口径一致）。 */
function enterDone(
  state: RefreshFeedbackState,
  result: RefreshResult,
  now: number,
  holdMs: number | undefined,
): RefreshFeedbackState {
  return {
    ...state,
    phase: 'done',
    pendingResult: null,
    finishAt: now + (holdMs ?? REFRESH_DONE_HOLD_MS),
    result,
  }
}

export function nextRefreshFeedback(
  state: RefreshFeedbackState,
  action: RefreshFeedbackAction,
): RefreshFeedbackState {
  switch (action.type) {
    case 'start': {
      // 已在刷新中：忽略（按钮同时 disabled，这里是逻辑层的第二道闸）
      if (state.phase === 'busy') return state
      return {
        phase: 'busy',
        startedAt: action.now,
        minBusyMs: action.minBusyMs ?? REFRESH_MIN_BUSY_MS,
        pendingResult: null,
        finishAt: 0,
        result: null,
      }
    }

    case 'settle': {
      // 没有进行中的刷新（idle / 已经进 done 了）：丢弃
      if (state.phase !== 'busy') return state

      const result = toResult(action.ok)
      // 还没到 minBusy：留在 busy，把结果暂存，等 tick
      if (action.now < state.startedAt + state.minBusyMs) {
        return { ...state, pendingResult: result }
      }
      return enterDone(state, result, action.now, action.holdMs)
    }

    case 'tick': {
      if (state.phase === 'busy') {
        // 结果已到，只是在等 minBusy 的下限用完
        if (state.pendingResult === null) return state
        if (action.now < state.startedAt + state.minBusyMs) return state
        return enterDone(state, state.pendingResult, action.now, undefined)
      }
      if (state.phase === 'done') {
        if (action.now < state.finishAt) return state
        return REFRESH_IDLE
      }
      return state
    }

    default:
      return state
  }
}

/** 按钮是否应处于禁用态（刷新进行中不许再点）。 */
export const isRefreshBusy = (state: RefreshFeedbackState): boolean => state.phase === 'busy'

/**
 * 按钮上该显示什么（相位 + 结局 → 展示口径）。
 *
 * 抽成纯函数是为了让「什么时候显示转圈 / 勾 / 叉」也有单测，
 * 而不是埋在 JSX 的三元表达式里。
 */
export type RefreshButtonIcon = 'none' | 'spinner' | 'check' | 'cross'

export interface RefreshButtonView {
  /** 展示文案（i18n 键，调用方取词） */
  labelKey: 'refreshStatus' | 'refreshStatusBusy' | 'refreshStatusDone' | 'refreshStatusFail'
  icon: RefreshButtonIcon
  /** 是否禁用（busy 期间防连点） */
  disabled: boolean
  /** 供 aria-live 提示用（busy/done 时给屏幕阅读器） */
  live: boolean
}

export function refreshButtonView(state: RefreshFeedbackState): RefreshButtonView {
  switch (state.phase) {
    case 'busy':
      return { labelKey: 'refreshStatusBusy', icon: 'spinner', disabled: true, live: true }
    case 'done':
      return state.result === 'fail'
        ? { labelKey: 'refreshStatusFail', icon: 'cross', disabled: false, live: true }
        : { labelKey: 'refreshStatusDone', icon: 'check', disabled: false, live: true }
    default:
      return { labelKey: 'refreshStatus', icon: 'none', disabled: false, live: false }
  }
}
