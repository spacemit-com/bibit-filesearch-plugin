/**
 * 「恢复默认」按钮的两步确认状态机（纯函数，可单测）。
 *
 * 为什么不用 window.confirm：宿主是 Tauri webview，原生弹窗在各平台表现不一
 * （有的被禁用、有的阻塞渲染），且无法被 e2e/单测观察。改为「按钮变确认态」
 * 的就地二次确认：第一次点击进入 armed，第二次点击才真正执行。
 *
 * 状态语义：
 *   - armed=false, fire=false：空闲
 *   - armed=true,  fire=false：已武装，等用户再点一次
 *   - fire=true：本次点击应触发实际的重置请求（armed 同时归位为 false，
 *     避免请求失败后按钮还停在确认态）
 *
 * 触发执行的只有「armed 状态下再点一次」这一条路径。
 *
 * **武装态不自动超时**：若给自动解除，点一次后离开再回来确认态已消失，得重新点两次。
 * 武装态一直保持，只有四种情况解除：
 *   - 用户点了确认条上的「取消」按钮（显式反悔）
 *   - 用户改了表单字段（说明他已不打算恢复默认）
 *   - 重置成功（done）
 *   - 请求失败（cancel，避免失败后按钮还红着）
 * 误触风险由「红色按钮 + 文案变『再点一次确认』+ 下方说明条」承担——第二次点击
 * 必须落在同一个已变色的按钮上。
 *
 * 确认条上带「取消」按钮，作为直接的反悔入口（否则只能靠「改个字段」或「再点一次」
 * 退出武装态）。取消按钮复用 'cancel' 动作
 * （与请求失败同一条「解除武装」路径，语义一致：不执行重置、回到空闲）。
 */

export interface ResetConfirmState {
  /** 是否处于「等待二次确认」状态 */
  armed: boolean
  /** 本次动作是否应真正执行重置 */
  fire: boolean
}

export const RESET_IDLE: ResetConfirmState = { armed: false, fire: false }

export type ResetConfirmAction =
  | 'click' // 点按钮（空闲→武装；武装→执行）
  | 'cancel' // 解除武装：用户点确认条上的「取消」按钮，或请求失败
  | 'done' // 重置成功
  | 'edit' // 用户改了表单

export function nextResetConfirm(
  state: ResetConfirmState,
  action: ResetConfirmAction,
): ResetConfirmState {
  switch (action) {
    case 'click':
      return state.armed ? { armed: false, fire: true } : { armed: true, fire: false }
    case 'cancel':
    case 'done':
    case 'edit':
      return RESET_IDLE
    default:
      return state
  }
}
