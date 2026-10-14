import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  useFeatureHostApi,
  type FeatureSettingsProps,
} from '@bibit/feature-sdk'
import {
  FilesearchClient,
  baseUrlForUid,
  type FilesearchSettings,
  type ScanProgress,
  type SearchResponse,
} from './filesearchClient'
import { scanProgressView, notIndexedTotalOf, type NotIndexedItemView } from './scanProgress'
import {
  failureReasonText,
  notIndexedReasonText,
  notIndexedSummaryText,
} from './detailText'
import {
  createTranslator,
  normalizeLanguage,
  type LocaleKey,
} from './locales'
import {
  RESET_IDLE,
  nextResetConfirm,
  type ResetConfirmState,
} from './resetConfirm'
import {
  REFRESH_IDLE,
  isRefreshBusy,
  nextRefreshFeedback,
  refreshButtonView,
  type RefreshFeedbackState,
} from './refreshFeedback'
import './filesearch.css'

/* ==========================================================================
   表单控件规则运行时注入
   K3 的 WebKitGTK 2.52.0 存在 @scope 缺陷：宿主 trustedPluginLoader 把插件 CSS
   包进 `@scope (<custom-element>) { … }` 注入后，规则对 input/textarea/button 等
   表单控件完全不生效（计算样式回落 UA 默认：2px inset / 1px solid black，
   width:100% 也不生效=UA 默认 169px；div/span/label 正常）。因此：
   - filesearch.css（走宿主 @scope 注入）只保留 div/span/label 等布局外观规则；
   - 凡选择器触及 input/textarea/button 的规则都放在下面这段无 @scope 的 <style>
     里，由插件 JS 直挂 document.head，选择器一律以 .fs-settings 祖先前缀隔离，
     不污染宿主其它输入框。
   ========================================================================== */
const FS_FORM_CSS = `
.fs-settings .fs-input {
  display: block;
  width: 100%;
  min-width: 0;
  height: 34px;
  padding: 0 10px;
  border: 1px solid color-mix(in oklch, var(--muted-foreground) 35%, transparent);
  border-radius: calc(var(--radius) - 2px);
  background: var(--background);
  color: var(--foreground);
  font-size: 13px;
  font-family: inherit;
  caret-color: var(--foreground);
  outline: none;
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
}

.fs-settings .fs-input:hover {
  border-color: color-mix(in oklch, var(--muted-foreground) 55%, transparent);
}

.fs-settings textarea.fs-input {
  height: auto;
  min-height: 64px;
  padding: 8px 10px;
  line-height: 1.5;
  resize: vertical;
}

.fs-settings .fs-input::placeholder { color: color-mix(in oklch, var(--muted-foreground) 75%, transparent); }

.fs-settings .fs-input:focus-visible {
  border-color: var(--ring);
  box-shadow: 0 0 0 3px color-mix(in oklch, var(--ring) 30%, transparent);
}

.fs-settings .fs-input:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.fs-settings .fs-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  height: 34px;
  padding: 0 16px;
  border: none;
  border-radius: 999px;
  font-size: 13px;
  font-weight: 500;
  font-family: inherit;
  line-height: 1;
  cursor: pointer;
  white-space: nowrap;
  transition: background-color 0.15s ease, box-shadow 0.15s ease, opacity 0.15s ease;
  outline: none;
}

.fs-settings .fs-btn:focus-visible {
  box-shadow: 0 0 0 3px color-mix(in oklch, var(--ring) 40%, transparent);
}

.fs-settings .fs-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  pointer-events: none;
}

.fs-settings .fs-btn-primary {
  background: var(--primary);
  color: var(--primary-foreground);
}
.fs-settings .fs-btn-primary:hover:not(:disabled) {
  background: color-mix(in oklch, var(--primary) 88%, transparent);
}

.fs-settings .fs-btn-secondary {
  background: var(--secondary);
  color: var(--secondary-foreground);
  border: 1px solid transparent;
}
.fs-settings .fs-btn-secondary:hover:not(:disabled) {
  background: color-mix(in oklch, var(--secondary) 80%, var(--background));
}

.fs-settings .fs-btn-sm {
  height: 26px;
  padding: 0 12px;
  font-size: 12px;
}

/* 「恢复默认」二次确认态：第二次点击才真正执行，故用危险色区分 */
.fs-settings .fs-btn-danger {
  background: var(--destructive);
  color: #fff;
}
.fs-settings .fs-btn-danger:hover:not(:disabled) {
  background: color-mix(in oklch, var(--destructive) 85%, black);
}

/* ---------- 「刷新状态」按钮的点击反馈 ----------
   规则必须放在这里（无 @scope 运行时注入）：选择器触及 button，
   写在 @scope 包裹的 filesearch.css 里会整条失效（宿主 @scope 缺陷）。
   三相位：is-busy（转圈）/ is-done（勾/叉，短暂保持）/ idle（原样）。 */

/* 相位切换时给一点底色/描边变化，让「点击已被接收」一眼可见 */
.fs-settings .fs-refresh-btn.is-busy,
.fs-settings .fs-refresh-btn.is-done {
  background: color-mix(in oklch, var(--primary) 12%, var(--secondary));
  color: var(--foreground);
}

/* busy 期间按钮禁用，但不要把 opacity 压到看不出动画（.fs-btn:disabled 是 0.5） */
.fs-settings .fs-refresh-btn.is-busy:disabled {
  opacity: 1;
  cursor: progress;
}

.fs-settings .fs-refresh-btn .fs-refresh-spinner {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  border: 2px solid color-mix(in oklch, var(--muted-foreground) 35%, transparent);
  border-top-color: var(--primary);
  animation: fs-refresh-spin 0.7s linear infinite;
  flex-shrink: 0;
}

@keyframes fs-refresh-spin {
  to { transform: rotate(360deg); }
}

/* done 相位的勾/叉：出现时弹一下，避免与 busy 之间显得生硬 */
.fs-settings .fs-refresh-btn .fs-refresh-mark {
  display: inline-block;
  font-size: 12px;
  font-weight: 700;
  line-height: 1;
  animation: fs-refresh-pop 0.22s ease-out;
  flex-shrink: 0;
}

/* 成功用绿（与状态胶囊 ok 同色）；失败用危险色，和文案「刷新失败」一致 */
.fs-settings .fs-refresh-btn .fs-refresh-mark.is-ok { color: #15803d; }
.fs-settings .fs-refresh-btn .fs-refresh-mark.is-fail { color: var(--destructive); }

@keyframes fs-refresh-pop {
  0% { transform: scale(0.6); opacity: 0; }
  60% { transform: scale(1.15); opacity: 1; }
  100% { transform: scale(1); opacity: 1; }
}

.fs-settings .fs-link {
  border: none;
  background: none;
  padding: 0;
  font-size: 12px;
  color: var(--primary);
  cursor: pointer;
  font-family: inherit;
  border-radius: 4px;
}
.fs-settings .fs-link:hover { text-decoration: underline; }
.fs-settings .fs-link:focus-visible { outline: none; box-shadow: 0 0 0 2px color-mix(in oklch, var(--ring) 45%, transparent); }

.fs-settings .fs-chip input {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  margin: 0;
  opacity: 0;
  cursor: pointer;
  z-index: 1;
}

.fs-settings .fs-chip input:checked + .fs-chip-box,
.fs-settings .fs-chip.is-on .fs-chip-box {
  background: var(--primary);
  border-color: var(--primary);
  color: var(--primary-foreground);
  font-weight: 600;
  box-shadow: 0 0 0 1px color-mix(in oklch, var(--primary) 35%, transparent);
}

.fs-settings .fs-chip input:checked + .fs-chip-box::before,
.fs-settings .fs-chip.is-on .fs-chip-box::before {
  content: '✓';
  margin-right: 5px;
  font-size: 11px;
  font-weight: 700;
  line-height: 1;
}

.fs-settings .fs-chip input:focus-visible + .fs-chip-box {
  outline: none;
  box-shadow: 0 0 0 3px color-mix(in oklch, var(--ring) 35%, transparent);
}

.fs-settings .fs-switch input {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  margin: 0;
  opacity: 0;
  cursor: pointer;
}

.fs-settings .fs-switch input:checked + .fs-switch-track {
  background: var(--primary);
}

.fs-settings .fs-switch input:checked + .fs-switch-track .fs-switch-thumb {
  transform: translateX(14px);
}

.fs-settings .fs-switch input:focus-visible + .fs-switch-track {
  box-shadow: 0 0 0 3px color-mix(in oklch, var(--ring) 40%, transparent);
}

.fs-settings .fs-verify-input {
  flex: 1 1 0%;
  min-width: 50%;
  max-width: none;
  width: auto;
  height: 36px;
}

.fs-settings .fs-verify-btn {
  flex: 0 0 auto;
  height: 36px;
}

@media (max-width: 760px) {
  .fs-settings .fs-verify-btn { width: 100%; }
  .fs-settings .fs-verify-input { width: 100%; min-width: 0; }
}
`

const FS_FORM_STYLE_ID = 'filesearch-form-controls'

function injectFormControlStyles(): void {
  if (typeof document === 'undefined') return
  if (document.getElementById(FS_FORM_STYLE_ID)) return
  const style = document.createElement('style')
  style.id = FS_FORM_STYLE_ID
  style.textContent = FS_FORM_CSS
  document.head.appendChild(style)
}

// 模块加载即注入（早于宿主 installStyles 的 @scope 注入，互不干扰）
injectFormControlStyles()

// 格式按类别分组展示（20 个无差别平铺难读）。
// label/tip 存 i18n 键，渲染时按当前语言取词。
const TYPE_GROUPS: {
  labelKey: LocaleKey
  tipKey?: LocaleKey
  types: readonly string[]
}[] = [
  {
    labelKey: 'formats.groups.docs',
    types: ['txt', 'md', 'docx', 'pdf'],
  },
  {
    labelKey: 'formats.groups.code',
    types: ['py', 'js', 'ts', 'java', 'c', 'cpp', 'cs', 'go', 'rs', 'sql', 'sh', 'json'],
  },
  {
    labelKey: 'formats.groups.sheets',
    types: ['xlsx', 'pptx'],
  },
  {
    labelKey: 'formats.groups.images',
    tipKey: 'formats.groups.imagesTip',
    types: ['png', 'jpg'],
  },
]
const FLAT_TYPES = TYPE_GROUPS.flatMap((g) => g.types)

// 摘要不在本插件范围内：后端不提供 summary 字段。
const SHOW_FS_SUMMARY = false

/**
 * 检索请求的 pageSize。本页无翻页控件，故一次取满——后端已按用户设置的 Top-K
 * 截断（单次检索最多返回条数），返回多少就列多少，保证「共 N 条匹配」与列表一致。
 * 取 100 = 后端 pageSize 校验上限（retriever._validate），也是 Top-K 的可调上限。
 */
const SEARCH_PAGE_SIZE = 100

/**
 * 出厂默认的「检索返回条数（Top-K）」，必须与后端 DEFAULTS["top_k"] 一致。
 * 只在拿不到后端设置时兜底（首帧未加载、请求失败、输入框被清空），正常路径永远用后端值。
 * 与后端不一致时，页面打开瞬间输入框会先显示一个错的值再被服务端值覆盖。
 */
const DEFAULT_TOP_K = 5

type Notice = { kind: 'success' | 'info' | 'error'; text: string }

const formatCount = (value: number | undefined | null, locale: string) =>
  value === undefined || value === null ? '-' : value.toLocaleString(locale)

const formatBytes = (bytes: number | undefined | null) => {
  if (bytes === undefined || bytes === null || Number.isNaN(bytes)) return ''
  if (bytes < 1024) return `${bytes} B`
  const units = ['KB', 'MB', 'GB']
  let value = bytes
  let unit = 'B'
  for (const next of units) {
    value /= 1024
    unit = next
    if (value < 1024) break
  }
  return `${value.toFixed(1)} ${unit}`
}

const formatDate = (iso: string | undefined | null, locale: string) => {
  if (!iso) return ''
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  return date.toLocaleDateString(locale, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
}

/** label 旁的 ? 帮助图标：hover / 键盘聚焦（tabIndex）弹出纯 CSS tooltip（样式见 filesearch.css .fs-help/.fs-tooltip） */
function Help({ tip }: { tip: string }) {
  return (
    // Help 放进 <label> 内（自动索引开关那行）时有两个坑——
    // ① FS_FORM_CSS 给 .fs-switch input 设了 position:absolute; inset:0（铺满整个
    //    label），? 图标被透明 input 盖住 → hover 永远不落在 .fs-help 上，纯 CSS
    //    气泡不显示；
    // ② 即使命中 ? 图标，click 冒泡到 label 会触发 label 的激活行为 → 误切开关
    //    （实测：想看提示却把自动索引关了）。
    // 解法：CSS 抬 z-index 让它成为命中目标 + 这里 preventDefault 阻断 label 激活。
    <span
      className="fs-help"
      tabIndex={0}
      aria-label={tip}
      onClick={(e) => e.preventDefault()}
    >
      <span className="fs-help-icon" aria-hidden="true">?</span>
      <span className="fs-tooltip" role="tooltip">{tip}</span>
    </span>
  )
}

// 宿主通过 props.language 下发**已解析的最终语言**（见 locales/index.ts）。
// 可选字段（契约里 language?: string）：宿主未下发时按英文渲染。
//
// hostUid 说明：bibit 上游 FeatureHostApiV1 目前**没有** hostUid 字段——宿主侧的
// hostUid 补丁只在本地分支 feat/k3-multiuser-hostuid 上，未进上游。插件按可选字段
// 读取，宿主不下发（上游宿主 / dev-host）即 undefined，baseUrlForUid 回退默认 18700。
type HostApiWithHostUid = { hostUid?: number }

export function FilesearchPage(props: FeatureSettingsProps) {
  // 宿主包了 FeatureHostApiProvider，settings 页组件内可直接取 hostApi
  const hostApi = useFeatureHostApi()
  const baseUrl = baseUrlForUid((hostApi as HostApiWithHostUid).hostUid)
  const clientRef = useRef(new FilesearchClient(baseUrl))
  // 语言：由宿主经 props 下发（已解析，'en' / 'zh-CN'）。宿主切语言会重渲染插件根节点，
  // 故不再读宿主存储、不再轮询（见 locales/index.ts 的通道说明）。
  const language = normalizeLanguage(props.language)
  const t = useMemo(() => createTranslator(language).t, [language])
  // 供异步回调/effect 使用，避免把 t 加进依赖导致语言切换时重拉配置覆盖未保存表单
  const tRef = useRef(t)
  tRef.current = t
  const dateLocale = language === 'zh-CN' ? 'zh-CN' : 'en-US'
  const [progress, setProgress] = useState<ScanProgress | null>(null)
  const [serviceUp, setServiceUp] = useState<boolean | null>(null)
  // embed 依赖状态（/health/deep 探测结果）。null = 未知（服务未连上）
  const [embedUp, setEmbedUp] = useState<boolean | null>(null)
  const [embedUrl, setEmbedUrl] = useState('')
  const [saving, setSaving] = useState(false)
  const [showFailed, setShowFailed] = useState(false)
  // 与「失败文件」并列的第二个明细面板 —— 「查看未纳入索引文件」。
  // 未纳入索引也要像失败文件一样有查看入口：只有个数（「未纳入索引 3」）却查不到是哪 3 个。
  const [showNotIndexed, setShowNotIndexed] = useState(false)
  const [searching, setSearching] = useState(false)
  const [results, setResults] = useState<SearchResponse | null>(null)
  const [query, setQuery] = useState('')
  const [notice, setNotice] = useState<Notice | null>(null)
  const [configError, setConfigError] = useState<string | null>(null)
  const [dirError, setDirError] = useState<string | null>(null)
  const [searchError, setSearchError] = useState('')
  const [form, setForm] = useState({
    indexDirs: '',
    maxDepth: 3,
    topK: DEFAULT_TOP_K,
    exclude: '',
    autoIndex: true,
    types: new Set<string>(FLAT_TYPES),
  })
  // 恢复默认：就地二次确认（第一次点变确认态，第二次才执行）。见 resetConfirm.ts。
  // 武装态不自动超时——点一次后去别处看，回来确认态还在。
  const [resetState, setResetState] = useState<ResetConfirmState>(RESET_IDLE)
  const [resetting, setResetting] = useState(false)
  // 「刷新状态」按钮的点击反馈。见 refreshFeedback.ts：
  //   点击 → busy（转圈 + 文案「正在刷新…」+ 按钮禁用）
  //        → done（勾 + 文案「已刷新」/「刷新失败」，约 1.4s 后自动回 idle）
  // 请求在本机只要十几毫秒，所以 busy 有 420ms 下限，否则动画闪一帧等于没有。
  const [refreshFb, setRefreshFb] = useState<RefreshFeedbackState>(REFRESH_IDLE)
  const noticeTimerRef = useRef<number | undefined>(undefined)

  useEffect(() => () => window.clearTimeout(noticeTimerRef.current), [])

  /**
   * 表单被编辑 → 解除武装。用户开始改字段就说明他已经不打算恢复默认了，
   * 此时按钮若还停在确认态，下一次点击会意外触发重置。
   */
  const disarmReset = useCallback(() => {
    setResetState((s) => (s.armed ? nextResetConfirm(s, 'edit') : s))
  }, [])

  /**
   * 确认条上的「取消」按钮 → 解除武装，回到空闲。
   *
   * 与请求失败共用 'cancel' 动作：语义都是「不执行重置、退出确认态」。
   * 这样用户不用靠「改个字段」这种间接方式才能反悔。
   */
  const onResetCancel = useCallback(() => {
    setResetState((s) => nextResetConfirm(s, 'cancel'))
  }, [])

  const showNotice = useCallback((kind: Notice['kind'], text: string) => {
    setNotice({ kind, text })
    window.clearTimeout(noticeTimerRef.current)
    noticeTimerRef.current = window.setTimeout(() => setNotice(null), 6000)
  }, [])

  // 服务状态 + 进度轮询（2s）
  // 用 /health/deep —— 一次调用同时拿到「服务活着」与「embed 依赖可用」；
  // 否则 embed 掉线时界面仍显示「服务正常」，搜不到却看不到原因。
  //
  // opts.silent：后台定时轮询不驱动按钮的点击反馈动画
  // （否则每 2s 动画自己播一遍）。只有用户点按钮（或横幅里的「重试」）才带反馈：
  // 见 refreshWithFeedback。
  const refreshStatus = useCallback(async (opts?: { silent?: boolean }) => {
    const client = clientRef.current
    try {
      const deep = await client.healthDeep()
      setServiceUp(true)
      setEmbedUp(deep.embed === 'ok')
      setEmbedUrl(deep.embedUrl ?? '')
      const p = await client.scanProgress()
      setProgress(p)
      if (!opts?.silent) setRefreshFb((s) => nextSettle(s, true))
    } catch {
      setServiceUp(false)
      setEmbedUp(null)
      if (!opts?.silent) setRefreshFb((s) => nextSettle(s, false))
    }
  }, [])

  /**
   * 把瞬时动作派发给刷新状态机（补上时间锚点）。
   *
   * 时间推进只在一个地方做——`refreshTick` 那个 80ms 定时器里；
   * 这里只负责「点击」与「请求返回」两个瞬时事件，避免为 minBusy / hold
   * 各维护一个 setTimeout（两个定时器互相打断比单个轮询更易错）。
   */
  const nextSettle = useCallback(
    (s: RefreshFeedbackState, ok: boolean) =>
      nextRefreshFeedback(s, { type: 'settle', ok, now: Date.now() }),
    [],
  )

  /**
   * 用户点「刷新状态」（或服务不可用横幅里的「重试」）：**先亮 busy 相位，再真去刷**。
   * 顺序很关键——若等请求返回才改 UI，用户点下去仍然看不到即时反应
   * （请求只有十几毫秒，本次要修的就是「点了看不出反应」）。
   */
  const refreshWithFeedback = useCallback(async () => {
    setRefreshFb((s) => nextRefreshFeedback(s, { type: 'start', now: Date.now() }))
    await refreshStatus()
  }, [refreshStatus])

  /**
   * 反馈相位的时间推进：busy 到点转 done（含「请求早于下限返回」的暂存结果），
   * done 到点回 idle。只在有相位需要推进时开定时器，跑完自动停
   * （刷新反馈只存在几秒，不必常驻一个定时器）。
   */
  useEffect(() => {
    if (refreshFb.phase === 'idle') return undefined
    const timer = window.setInterval(
      () => setRefreshFb((s) => nextRefreshFeedback(s, { type: 'tick', now: Date.now() })),
      80,
    )
    return () => window.clearInterval(timer)
  }, [refreshFb.phase])

  // 配置回填表单
  // 记录「已保存快照」，用于脏标记（改了没保存时底部保存栏高亮）。
  // 序列化后比较，避免对象引用导致恒为脏。
  const snapshotRef = useRef('')
  const serializeForm = useCallback(
    (f: typeof form) =>
      JSON.stringify({
        indexDirs: f.indexDirs.split('\n').map((s) => s.trim()).filter(Boolean),
        maxDepth: Number.isFinite(f.maxDepth) ? Math.max(0, Math.trunc(f.maxDepth)) : 3,
        topK: Number(f.topK) || DEFAULT_TOP_K,
        exclude: f.exclude.split('\n').map((s) => s.trim()).filter(Boolean),
        autoIndex: f.autoIndex,
        types: Array.from(f.types).sort(),
      }),
    []
  )

  const applySettingsToForm = useCallback((s: FilesearchSettings) => {
    const next = {
      indexDirs: (s.index_dirs ?? []).join('\n'),
      maxDepth: s.max_depth ?? 3,
      topK: s.top_k ?? DEFAULT_TOP_K,
      exclude: (s.exclude_patterns ?? []).join('\n'),
      autoIndex: s.auto_index ?? true,
      types: new Set(s.indexable_types ?? FLAT_TYPES),
    }
    setForm(next)
    snapshotRef.current = serializeForm(next)
  }, [serializeForm])

  useEffect(() => {
    // silent：轮询刷新状态但**不驱动按钮动画**（动画只属于用户点击）
    void refreshStatus({ silent: true })
    // 2s 轮询：embed 恢复后看门狗 ≤5s 重跑失败文件，轮询间隔太大会让状态多挂几秒。
    // 代价是每 2s 两个回环请求（/health/deep + /api/scan/progress）。
    const timer = setInterval(() => void refreshStatus({ silent: true }), 2000)
    return () => clearInterval(timer)
  }, [refreshStatus])

  useEffect(() => {
    // 拉配置（服务在线才拉）
    if (serviceUp) {
      clientRef.current
        .getSettings()
        .then((s) => {
          applySettingsToForm(s)
          setConfigError(null)
          setDirError(null)
        })
        .catch((e: Error) => {
          setConfigError(tRef.current('errors.readConfig', { message: e.message }))
        })
    }
  }, [serviceUp, applySettingsToForm])

  /**
   * 「恢复默认」点击处理：两段式（第一次武装、第二次执行），见 resetConfirm.ts。
   *
   * 执行路径与「保存并索引」等价——后端 reset 端点无条件重应用 + 重扫，
   * 前端拿到恢复后的生效设置回填表单。
   */
  const onResetClick = async () => {
    const next = nextResetConfirm(resetState, 'click')
    setResetState(next)
    if (!next.fire) return // 第一次点击：只进入确认态
    if (resetting || serviceUp !== true) return

    setResetting(true)
    setConfigError(null)
    setDirError(null)
    setNotice(null)
    try {
      const data = await clientRef.current.resetSettings()
      applySettingsToForm(data)
      await refreshStatus({ silent: true })
      setResetState((s) => nextResetConfirm(s, 'done'))
      showNotice('success', t('reset.done'))
    } catch (e) {
      setConfigError((e as Error).message)
      setResetState((s) => nextResetConfirm(s, 'cancel'))
    } finally {
      setResetting(false)
    }
  }

  const saveConfig = async () => {
    if (saving || serviceUp !== true) return
    setSaving(true)
    setConfigError(null)
    setDirError(null)
    setNotice(null)
    try {
      const payload = {
        index_dirs: form.indexDirs.split('\n').map((s) => s.trim()).filter(Boolean),
        // max_depth 语义 0 = 无限深——显式 0 必须保留，不得 `|| 3` 吞 0；
        // 仅空/非数字回退默认 3；负数（min=0 已挡，兜底）归一为 0。
        max_depth: Number.isFinite(form.maxDepth) ? Math.max(0, Math.trunc(form.maxDepth)) : 3,
        top_k: Number(form.topK) || DEFAULT_TOP_K,
        exclude_patterns: form.exclude.split('\n').map((s) => s.trim()).filter(Boolean),
        auto_index: form.autoIndex,
        indexable_types: Array.from(form.types),
      }
      if (payload.index_dirs.length === 0) {
        showNotice('error', t('errors.pathRequired'))
        return
      }
      const data = await clientRef.current.updateSettings(payload)
      // 以服务端规范化后的值回填（同时更新脏标记快照）
      applySettingsToForm(data)
      // 按钮叫「保存并索引」，就必须真的索引：无条件触发扫描，否则想强制重跑
      //（如失败文件修好了权限、embed 刚恢复）时无路可走。未变文件由 scanner 的
      // hash 跳过，成本只是目录遍历。
      await clientRef.current.triggerScan()
      await refreshStatus({ silent: true })
      showNotice('success', data.changed === false ? t('notices.rescanned') : t('notices.saved'))
    } catch (e) {
      const msg = (e as Error).message
      // 知识库路径错误就近显示在路径输入框下（后端校验：不存在/不是目录/无权限/相对路径）
      // 后端仅返回中文错误文案（bibit-filesearch 服务侧未做 i18n），此处按原文透传
      if (msg.includes('知识库路径')) {
        setDirError(msg.replace(/^Error: /, ''))
        setConfigError(null)
      } else {
        setConfigError(msg)
      }
    } finally {
      setSaving(false)
    }
  }

  const doSearch = async () => {
    const q = query.trim()
    if (!q || searching || serviceUp !== true) return
    setSearching(true)
    setSearchError('')
    try {
      // pageSize 取 SEARCH_PAGE_SIZE（后端上限）：写小了会出现顶部「共 N 条匹配」
      // 却只列出前几条、且本页无翻页控件，多出的结果无处可看。一次取满——后端已按
      // Top-K 截断，返回多少就列多少。见 filesearchClient.search 的 pageSize 上限 100。
      const res = await clientRef.current.search(q, undefined, 1, SEARCH_PAGE_SIZE)
      setResults(res)
    } catch (e) {
      setSearchError((e as Error).message)
      setResults(null)
    } finally {
      setSearching(false)
    }
  }

  const toggleType = (t: string) => {
    disarmReset()
    setForm((prev) => {
      const next = new Set(prev.types)
      if (next.has(t)) next.delete(t)
      else next.add(t)
      return { ...prev, types: next }
    })
  }

  const setAllTypes = (checked: boolean) => {
    disarmReset()
    setForm((prev) => ({ ...prev, types: checked ? new Set(FLAT_TYPES) : new Set<string>() }))
  }

  /** 表单字段编辑：统一解除「恢复默认」的武装态（用户开始改字段即放弃重置）。 */
  const editForm = (patch: Partial<typeof form>) => {
    disarmReset()
    setForm((prev) => ({ ...prev, ...patch }))
  }

  const scanning = progress?.status === 'scanning'
  // 进度口径收进 scanProgressView（纯函数，带单测），见该模块注释——
  // 进度条与那行文字若各取**不同阶段**的数字（向量化 vs 遍历），遍历很快跑完，
  // 会长期显示「扫描中 + N/N」这种自相矛盾。
  const view = scanProgressView(progress?.scanPhase, progress?.vectorizePhase, {
    scanning: Boolean(scanning),
    serviceUp,
  })

  const serviceDown = serviceUp === false
  const serviceConnecting = serviceUp === null
  // 失败文件数（多处使用；失败归 0 时明细面板需收起，见下方 effect）
  const failedCount = progress?.vectorizePhase.failed ?? 0
  // 「失败文件」格的数与它展开后的列表必须**同源同长**。
  //
  // 症状：格上写「失败 0」，点开却有 2 条 —— 因为计数取 DB 的
  // `vectorizePhase.failed`（持久，只统计库里有行的文件），而列表取
  // `scanPhase.errorDetails`（含**根本没进库**的文件，例如文件名不是 UTF-8 的：
  // 它们连行都没有，DB 永远数不到）。两处再叠加「计数为 0 就强制收起面板」的 effect，
  // 三处夹击会让明细面板**不可达**。
  //
  // 口径：格上的数 = 明细条数。想看「库里有多少行是 failed」用
  // /health/deep 或下方 dbFailedCount 的补注。
  const liveFailedCount = progress?.scanPhase?.errorDetails?.length ?? 0
  // 「未纳入索引」= 后端 notIndexedPhase.total。
  //
  // 不要改回前端自拼 `scanPhase.excluded + vectorizePhase.unsupported`：两处来源、
  // 两套语义，明细一旦要展示就得再拼一次。后端已把它收成一个出口
  //（遍历侧 + 库侧合并），这里只读那一个数。
  // 老后端（没这一节）兜底由 notIndexedTotalOf 负责，行为不变。
  const notIndexedPhase = progress?.notIndexedPhase
  const notIndexedTotal = notIndexedTotalOf(
    progress?.scanPhase, progress?.vectorizePhase, notIndexedPhase)
  // 明细（与上面的数同源）：total 是全量真值，details 是样本，必要时如实说明差额。
  const notIndexedDetails: NotIndexedItemView[] = notIndexedPhase?.details ?? []
  // 内容不完整（被单文件块数上限截断）**不在界面上展示**：这属于内部细节，
  // 不必给最终用户看。数据仍在后端 /api/scan/progress
  // （vectorizePhase.truncated / truncationDetails），供调试取证：
  //   curl -s :18700/api/scan/progress | jq '.data.vectorizePhase.truncationDetails' 
  // 脏标记：表单与已保存快照不一致 → 底部保存栏高亮。
  // 解决「改完配置滚到下方搜索、忘记保存 / 以为已生效」的困惑。
  const dirty = snapshotRef.current !== '' && serializeForm(form) !== snapshotRef.current
  // 失败明细面板与失败计数绑定——失败归 0（重跑成功 / 换配置）时自动收起，
  // 否则会出现「失败文件 0 却还挂着上一轮明细」的矛盾状态。
  useEffect(() => {
    // 收起条件是**明细空了**，而不是 DB 失败数归零：只要出现「DB failed=0 但明细非空」
    //（遍历失败的文件没进库、或 embed 掉线期间的失败已重跑成功），
    // 面板会被立刻收起，明细永远看不到。
    if (liveFailedCount === 0) setShowFailed(false)
  }, [liveFailedCount])
  // 同上——「未纳入索引」归 0（换配置重扫成功）时自动收起明细。
  useEffect(() => {
    if (notIndexedTotal === 0) setShowNotIndexed(false)
  }, [notIndexedTotal])

  // 状态语义：状态必须反映「索引是否真的可用」，不能只映射后端的扫描动作。
  // embed 掉线时后端仍是 done（扫描跑完了），但索引全是 failed——显示「已完成」是错的。
  // 优先级：服务不可达 > 探测中 > 扫描中 > 暂停 > embed 不可用 > 索引出错 > 完成(有失败) > 完成 > 空闲
  // 扫描中 / 暂停提到 embed 之前。原因见后端 is_healthy —— 探活要跟批次
  // 抢同一个串行服务，忙时会假超时；后端已改成"忙时被动自证、闲时才真探"，这层
  // 再兜一次：扫描进行中，用户要看的是进度，而不是一个会随探测节拍来回跳的依赖告警。
  // 后端 status 的语义是「**管道里还有没有活在干**」，覆盖 scanner 全盘扫描与
  // watcher 增量（若只有前者写状态，拷目录进来时实际上在算向量、界面却显示「已完成」）。
  // 前端口径无需改动。契约：docs/scan-status-contract.md。
  const statusPill = (() => {
    if (serviceDown) return { cls: 'down', text: t('pill.down') }
    if (serviceConnecting) return { cls: 'connecting', text: t('pill.connecting') }
    if (progress?.status === 'scanning') return { cls: 'scanning', text: t('pill.scanning') }
    if (progress?.status === 'paused') return { cls: 'paused', text: t('pill.paused') }
    if (embedUp === false) return { cls: 'paused', text: t('pill.embedDown') }
    if (progress?.status === 'error') return { cls: 'error', text: t('pill.error') }
    if (progress?.status === 'done') {
      // **状态里不出现「N 个失败」**：三件事是「已完成」+「失败文件 4」+「可查看明细」，
      // 「4 个失败」在失败格与明细面板里各有一份，胶囊上再来一份是重复。
      // 因此这里保留 pause 色（有失败仍用异色提示），文案只出「已完成」。
      // 计数仍由 failedCount 决定**颜色**与下方 statusReason 那句，信息没丢。
      return failedCount > 0
        ? { cls: 'paused', text: t('pill.done') }
        : { cls: 'ok', text: t('pill.done') }
    }
    return { cls: 'idle', text: t('pill.idle') }
  })()
  // 状态格下方的原因说明（embed 依赖告警并入这里，不单列横幅）
  // 与 statusPill 同一优先级——扫描 / 暂停时不叠加依赖告警，
  // 否则会出现「pill 显示扫描中、下面却写服务未启动」的自相矛盾。
  const statusReason = (() => {
    if (serviceDown || serviceConnecting) return ''
    if (progress?.status === 'scanning' || progress?.status === 'paused') return ''
    if (embedUp === false) return t('status.embedDownReason', { embedUrl: embedUrl || '-' })
    if (failedCount > 0) return t('status.failedReason', { count: failedCount })
    return ''
  })()

  // 「刷新状态」按钮当前该显示什么（转圈/勾/叉 + 文案 + 是否禁用）。
  // 纯函数在 refreshFeedback.ts，单测覆盖各相位组合。
  const refreshView = refreshButtonView(refreshFb)

  return (
    <div className="fs-settings">
      {/* 页面头 */}
      <header className="fs-header">
        <div className="fs-header-text">
          <h1 className="fs-title">{t('title')}</h1>
          <p className="fs-subtitle">{t('subtitle')}</p>
        </div>
        <div className="fs-header-actions">
          <span className={`fs-pill fs-pill-${statusPill.cls}`} role="status">
            <i className="fs-pill-dot" aria-hidden="true" />
            {statusPill.text}
          </span>
          <button
            type="button"
            className={`fs-btn fs-btn-secondary fs-btn-sm fs-refresh-btn is-${refreshFb.phase}`}
            onClick={() => { void refreshWithFeedback(); setConfigError(null); setSearchError('') }}
            disabled={refreshView.disabled}
            aria-busy={refreshFb.phase === 'busy'}
          >
            {refreshView.icon === 'spinner' && (
              <span className="fs-refresh-spinner" aria-hidden="true" />
            )}
            {refreshView.icon === 'check' && (
              <span className="fs-refresh-mark is-ok" aria-hidden="true">✓</span>
            )}
            {refreshView.icon === 'cross' && (
              <span className="fs-refresh-mark is-fail" aria-hidden="true">✕</span>
            )}
            {/* 文案随相位变（刷新中 → 已刷新）；aria-live 让读屏也能听到这次点击的结果 */}
            <span aria-live={refreshView.live ? 'polite' : 'off'}>{t(refreshView.labelKey)}</span>
          </button>
        </div>
      </header>

      {/* 服务不可用提示 */}
      {serviceDown && (
        <div className="fs-alert fs-alert-error" role="alert">
          <div className="fs-alert-body">
            <strong>{t('serviceDown.title')}</strong>
            <span>{t('serviceDown.body', { baseUrl })}</span>
          </div>
          <button
            type="button"
            className="fs-btn fs-btn-secondary fs-btn-sm fs-alert-action"
            onClick={() => void refreshWithFeedback()}
            disabled={refreshView.disabled}
            aria-busy={refreshFb.phase === 'busy'}
          >
            {refreshView.icon === 'spinner' && (
              <span className="fs-refresh-spinner" aria-hidden="true" />
            )}
            <span>{refreshFb.phase === 'busy' ? t('refreshStatusBusy') : t('retry')}</span>
          </button>
        </div>
      )}

      {/* 概览统计 */}
      <section className="fs-stats" aria-label={t('stats.aria')}>
        <div className="fs-stat">
          <span className="fs-stat-label">{t('stats.status')}</span>
          {/* 与顶部 pill 同一套语义（各自映射后端 status 会让 embed 掉线时
              这里仍显示「已完成」，与失败计数矛盾） */}
          <span className={`fs-stat-value ${statusPill.cls === 'ok' ? 'is-ok' : statusPill.cls === 'down' || statusPill.cls === 'error' ? 'is-error' : ''}`}>
            {statusPill.text}
          </span>
          {statusReason && <span className="fs-stat-sub">{statusReason}</span>}
          {/* 遍历阶段不画进度条：此时能拿到的向量化计数还是上一轮的存量，
              画出来会是「100% 而状态是扫描中」——正是这次要消掉的误导。
              那几秒由下面那行「正在遍历文件 x / N」承担信息。 */}
          {view.showBar && (
            <div className="fs-progress" aria-label={t('stats.progressAria', { pct: view.pct })}>
              <i style={{ width: `${view.pct}%` }} />
            </div>
          )}
          {/* 进度文字与进度条同一基准：遍历期间（walked < total）说遍历；
              遍历一结束就只面向向量化——不出现「扫描中 + N/N」这种自相矛盾。 */}
          {view.showWalkLine && (
            <span className="fs-stat-sub">
              {t('stats.progressWalking', {
                done: formatCount(view.walkDone, dateLocale),
                total: formatCount(view.walkTotal, dateLocale),
              })}
            </span>
          )}
          {view.showProcessedLine && (
            <span className="fs-stat-sub">
              {t('stats.progressFiles', {
                done: formatCount(view.done, dateLocale),
                total: formatCount(view.total, dateLocale),
                pending: formatCount(view.pending, dateLocale),
              })}
            </span>
          )}
        </div>
        <div className="fs-stat">
          <span className="fs-stat-label">{t('stats.indexed')}</span>
          <span className="fs-stat-value">{serviceUp ? formatCount(progress?.vectorizePhase.completed, dateLocale) : '-'}</span>
        </div>
        <div className="fs-stat">
          <span className="fs-stat-label">{t('stats.queued')}</span>
          {/* 取 view.pendingTotal，它直接等于后端 `vectorizePhase.pending`
              （索引池中 queued + vectorizing 的行数）。
              不要改回前端自拼 queued + vectorizing + inflight：那个 inflight 挂在两条
              索引路径的公共入口上，同一文件既算库行又算 inflight，会被数两遍。
              见 scanProgress.ts。 */}
          <span className="fs-stat-value">{serviceUp ? formatCount(view.pendingTotal, dateLocale) : '-'}</span>
        </div>
        {/* 第 4 格：未纳入索引。
            这类文件（命中排除规则 / 超出索引深度 / 格式没勾 / 没文本）
            **不进索引池、在库里没有行**，否则用户问「我的文件怎么没被索引」时哪儿都
            查不到。计数与明细都由后端 notIndexedPhase 给出，两者同源。
            没有这类文件时整格隐藏（不占版面）。 */}
        {serviceUp && notIndexedTotal > 0 && (
          <div className="fs-stat">
            <span className="fs-stat-label">
              {t('stats.notIndexed')}
              <Help tip={t('stats.notIndexedHint')} />
            </span>
            <span className="fs-stat-value fs-stat-value-muted">
              {formatCount(notIndexedTotal, dateLocale)}
            </span>
            {/* 与「失败文件」同款查看入口（只有个数时查不到是哪些文件）。
                明细来自后端 notIndexedPhase.details，与上面的数**同源**；
                样本不足时下方面板如实说明差额。 */}
            {notIndexedDetails.length > 0 && (
              <button
                type="button"
                className="fs-link fs-stat-link"
                onClick={() => setShowNotIndexed((v) => !v)}
                aria-expanded={showNotIndexed}
              >
                {showNotIndexed
                  ? t('notIndexedFiles.hide')
                  : t('notIndexedFiles.toggle', { count: formatCount(notIndexedDetails.length, dateLocale) })}
              </button>
            )}
          </div>
        )}
        <div className="fs-stat">
          <span className="fs-stat-label">{t('stats.failed')}</span>
          {/* 计数与明细**同源**：两处都按「明细里的条目数」算。
              若计数读 DB `failed`、明细读另一路内存数据，会出现「失败 0、展开却有 2 条」；
              再叠加「计数为 0 就强制收起面板」的 effect，明细会变得**不可达**。 */}
          <span className={`fs-stat-value ${liveFailedCount > 0 ? 'is-error' : ''}`}>
            {serviceUp ? formatCount(liveFailedCount, dateLocale) : '-'}
          </span>
          {/* 失败文件可展开看明细（后端 errorDetails） */}
          {serviceUp && liveFailedCount > 0 && (
            <>
              <button
                type="button"
                className="fs-link fs-stat-link"
                onClick={() => setShowFailed((v) => !v)}
                aria-expanded={showFailed}
              >
                {showFailed
                  ? t('failedFiles.hide')
                  : t('failedFiles.toggle', { count: liveFailedCount })}
              </button>
            </>
          )}
        </div>
      </section>

      {/* 失败文件明细（本次扫描的 errorDetails）
          面板有**固定标题行**（两个框否则长得一样，分不清是哪个）；
          原因列按语言出词（结构化原因走 locales，其余原样显示），并限 3 行高度。 */}
      {showFailed && serviceUp && (
        <section className="fs-card" aria-label={t('failedFiles.panelTitle')}>
          <div className="fs-panel-head">
            {/* 标题用 h3 而非其它语义元素：面板是文档结构里的一节，宿主样式对 h3 无副作用 */}
            <h3 className="fs-panel-title">{t('failedFiles.panelTitle')}</h3>
            <span className="fs-panel-count">
              {formatCount(liveFailedCount, dateLocale)}
            </span>
          </div>
          {(() => {
            const details = progress?.scanPhase?.errorDetails ?? []
            if (details.length === 0) {
              return (
                <>
                  <div className="fs-muted">{t('failedFiles.empty')}</div>
                  {failedCount > 0 && (
                    <div className="fs-muted">
                      {t('failedFiles.dbOnly', { count: formatCount(failedCount, dateLocale) })}
                    </div>
                  )}
                </>
              )
            }
            return (
              <ul className="fs-failed-list">
                {details.map((d, i) => (
                  <li key={`${d.path ?? 'item'}-${i}`} className="fs-failed-item">
                    {/* 无左侧徽标列：分类信息已在右侧原因句里
                        （如「The filename is not UTF-8…」）。 */}
                    <span className="fs-failed-path" title={d.path}>{d.path}</span>
                    {/* 原因句：只显示这一行文本，**不挂悬停提示**（否则会弹出含原始
                        字节 repr 的长串）。后端只给事实、文案在前端，故切英文时这行跟着变。 */}
                    <span className="fs-muted fs-failed-reason">
                      {failureReasonText(d.reason, t)}
                    </span>
                  </li>
                ))}
              </ul>
            )
          })()}
        </section>
      )}

      {/* 未纳入索引明细：**逐项对齐失败文件面板**。
          标题行只有「标题 + 计数」两个子元素（汇总句挂到计数的悬停上），
          明细行两列（文件名 | 原因），与失败面板同构、同列轨道。 */}
      {showNotIndexed && serviceUp && (
        <section className="fs-card" aria-label={t('notIndexedFiles.panelTitle')}>
          <div className="fs-panel-head">
            <h3 className="fs-panel-title">{t('notIndexedFiles.panelTitle')}</h3>
            {/* 与失败面板同构：标题行只有「标题 + 计数」，汇总句挂在这个计数的悬停上。 */}
            <span
              className="fs-panel-count"
              title={
                notIndexedTotal > 0 && notIndexedDetails.length > 0
                  ? notIndexedSummaryText(notIndexedPhase?.byKind, notIndexedTotal, t)
                  : undefined
              }
            >
              {formatCount(notIndexedTotal, dateLocale)}
            </span>
          </div>
          {(() => {
            if (notIndexedTotal === 0) {
              return <div className="fs-muted">{t('notIndexedFiles.empty')}</div>
            }
            if (notIndexedDetails.length === 0) {
              // 有计数、没明细：后端是本轮刚起来还没走完遍历，或样本槽位被耗尽。
              // 如实说明，不假装「没有」。
              return <div className="fs-muted">{t('notIndexedFiles.countOnly', { count: formatCount(notIndexedTotal, dateLocale) })}</div>
            }
            return (
              <>
                <ul className="fs-failed-list">
                  {notIndexedDetails.map((d, i) => (
                    <li key={`${d.path ?? 'item'}-${i}`} className="fs-failed-item">
                      <span className="fs-failed-path" title={d.path}>{d.path}</span>
                      {/* 第三列「说明句」：失败面板每行都有右侧说明，本面板此前没有，
                          于是行高 20px 对 37~55px、看起来空。补上后两面板逐项同构。 */}
                      <span className="fs-muted fs-failed-reason">
                        {notIndexedReasonText(d, t)}
                      </span>
                    </li>
                  ))}
                </ul>
                {notIndexedPhase?.detailsTruncated && (
                  <div className="fs-muted">
                    {t('notIndexedFiles.truncatedNote', {
                      shown: formatCount(notIndexedDetails.length, dateLocale),
                      total: formatCount(notIndexedTotal, dateLocale),
                    })}
                  </div>
                )}
              </>
            )
          })()}
        </section>
      )}

      {/* 索引配置 */}
      <section className="fs-card" aria-label={t('config.aria')}>
        <div className="fs-card-head">
          <h2 className="fs-card-title">
            {t('config.title')}
            {dirty && <span className="fs-unsaved">{t('config.unsaved')}</span>}
          </h2>
          {/* 自动索引开关放在标题行：它属于「索引配置」这个整体，放同一行更紧凑，
              也不用滚到底部才能看到 */}
          <div className="fs-card-actions">
            <label className="fs-switch fs-switch-inline">
              <span className="fs-label">{t('autoIndex.label')}</span>
              <Help tip={t('autoIndex.hint')} />
              <input
                type="checkbox"
                checked={form.autoIndex}
                onChange={(e) => editForm({ autoIndex: e.target.checked })}
              />
              <span className="fs-switch-track" aria-hidden="true">
                <span className="fs-switch-thumb" />
              </span>
              <span className="fs-switch-text">{form.autoIndex ? t('autoIndex.on') : t('autoIndex.off')}</span>
            </label>
            <button
              type="button"
              className={`fs-btn ${resetState.armed ? 'fs-btn-danger' : 'fs-btn-secondary'}`}
              onClick={() => void onResetClick()}
              disabled={resetting || serviceDown}
              title={t('reset.hint')}
            >
              {resetting
                ? t('reset.resetting')
                : resetState.armed
                  ? t('reset.confirm')
                  : t('reset.button')}
            </button>
            <button
              type="button"
              className="fs-btn fs-btn-primary"
              onClick={() => void saveConfig()}
              disabled={saving || serviceDown}
            >
              {saving ? t('config.saving') : t('config.save')}
            </button>
          </div>
        </div>

        {/* 武装态提示：按钮文案已变，这里再给一句「会丢掉什么」的说明 + 取消入口 */}
        {resetState.armed && (
          <div className="fs-notice fs-notice-info fs-notice-confirm" role="status">
            <span className="fs-notice-text">{t('reset.warning')}</span>
            <button
              type="button"
              className="fs-btn fs-btn-secondary fs-btn-sm"
              onClick={onResetCancel}
            >
              {t('reset.cancel')}
            </button>
          </div>
        )}

        {notice && (
          <div className={`fs-notice fs-notice-${notice.kind}`} role="status">
            {notice.text}
          </div>
        )}

        {configError && (
          <div className="fs-alert fs-alert-error fs-card-alert" role="alert">
            {configError}
          </div>
        )}

        <div className="fs-form">
          {/* 扫描范围 */}
          <div className="fs-form-group">
            <h3 className="fs-group-title">{t('scope.title')}</h3>
            <div className="fs-grid">
              <label className="fs-field fs-field-wide">
                <span className="fs-label-row">
                  <span className="fs-label">{t('paths.label')}</span>
                  <Help tip={t('paths.hint')} />
                </span>
                <textarea
                  className="fs-input"
                  rows={3}
                  placeholder="/home/xxx/Desktop"
                  value={form.indexDirs}
                  onChange={(e) => {
                    editForm({ indexDirs: e.target.value })
                    if (dirError) setDirError(null)
                  }}
                />
                {dirError && (
                  <span className="fs-field-error" role="alert">{dirError}</span>
                )}
              </label>
              <label className="fs-field">
                <span className="fs-label-row">
                  <span className="fs-label">{t('depth.label')}</span>
                  <Help tip={t('depth.hint')} />
                </span>
                <input
                  className="fs-input"
                  type="number"
                  min={0}
                  value={form.maxDepth}
                  onChange={(e) => editForm({ maxDepth: Number(e.target.value) })}
                />
              </label>
              <label className="fs-field">
                <span className="fs-label-row">
                  <span className="fs-label">{t('topK.label')}</span>
                  <Help tip={t('topK.hint')} />
                </span>
                <input
                  className="fs-input"
                  type="number"
                  min={1}
                  max={100}
                  value={form.topK}
                  onChange={(e) => editForm({ topK: Number(e.target.value) })}
                />
              </label>
            </div>
          </div>

          {/* 排除规则 */}
          <div className="fs-form-group">
            <h3 className="fs-group-title">{t('exclude.title')}</h3>
            <label className="fs-field">
              <span className="fs-label-row">
                <span className="fs-label">{t('exclude.label')}</span>
                <Help tip={t('exclude.hint')} />
              </span>
              <textarea
                className="fs-input"
                rows={2}
                placeholder={'.git\nnode_modules'}
                value={form.exclude}
                onChange={(e) => editForm({ exclude: e.target.value })}
              />
            </label>
          </div>

          {/* 文件类型 */}
          <div className="fs-form-group">
            <div className="fs-group-head">
              <h3 className="fs-group-title">
                <span className="fs-label-row">
                  {t('formats.title')}
                  <Help tip={t('formats.hint')} />
                </span>
              </h3>
              <span className="fs-group-actions">
                <span className="fs-chip-count">
                  {t('formats.selected', { selected: form.types.size, total: FLAT_TYPES.length })}
                </span>
                <button type="button" className="fs-link" onClick={() => setAllTypes(true)}>{t('formats.selectAll')}</button>
                <button type="button" className="fs-link" onClick={() => setAllTypes(false)}>{t('formats.clear')}</button>
              </span>
            </div>
            <div className="fs-type-groups">
              {TYPE_GROUPS.map((g) => {
                const label = t(g.labelKey)
                return (
                  <div key={g.labelKey} className="fs-type-group">
                    <div className="fs-type-group-head">
                      <span className="fs-type-group-label">{label}</span>
                      {g.tipKey && <span className="fs-type-group-tip">{t(g.tipKey)}</span>}
                    </div>
                    <div className="fs-types" role="group" aria-label={label}>
                      {g.types.map((type) => (
                        <label key={type} className={`fs-chip ${form.types.has(type) ? 'is-on' : ''}`}>
                          <input
                            type="checkbox"
                            checked={form.types.has(type)}
                            onChange={() => toggleType(type)}
                          />
                          <span className="fs-chip-box">{type}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </section>

      {/* 检索验证 */}
      <section className="fs-card" aria-label={t('verify.aria')}>
        <div className="fs-card-head">
          <h2 className="fs-card-title">{t('verify.title')}</h2>
          {results && results.total > 0 && (
            <span className="fs-muted">{t('verify.matches', { count: results.total })}</span>
          )}
        </div>
        <div className="fs-verify">
          <input
            className="fs-input fs-verify-input"
            type="text"
            placeholder={t('verify.placeholder')}
            value={query}
            disabled={serviceDown}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') void doSearch() }}
          />
          <button
            type="button"
            className="fs-btn fs-btn-primary fs-verify-btn"
            onClick={() => void doSearch()}
            disabled={searching || serviceDown || !query.trim()}
          >
            {searching ? t('verify.searching') : t('verify.search')}
          </button>
        </div>

        {searchError && (
          <div className="fs-alert fs-alert-error fs-card-alert" role="alert">
            {searchError}
          </div>
        )}

        <div className="fs-results">
          {searching && (
            <div className="fs-state fs-state-loading" role="status">
              <span className="fs-spinner" aria-hidden="true" />{t('verify.loading')}
            </div>
          )}
          {!searching && !results && !searchError && (
            <div className="fs-state">
              <span className="fs-state-title">{t('verify.empty.title')}</span>
              <span className="fs-state-desc">
                {serviceDown ? t('verify.empty.descDown') : t('verify.empty.desc')}
              </span>
            </div>
          )}
          {!searching && results && results.results.length === 0 && (
            <div className="fs-state">
              <span className="fs-state-title">{t('verify.noResults.title')}</span>
              <span className="fs-state-desc">
                {t('verify.noResults.desc')}
              </span>
            </div>
          )}
          {!searching && results && results.results.length > 0 && (
            <ul className="fs-result-list">
              {results.results.map((r, i) => {
                // 相关度名次（全局限次，非本页序）：后端 confidence 是 min-max 归一化，
                // 每次检索头名恒 100%、末名恒 0%，百分比会让人误读成「匹配度」。名次是
                // 它真正表达的信息。见 docs/manual-test-cases.md 的 B9。
                const rank = (results.page - 1) * results.pageSize + i + 1
                return (
                <li key={r.fileId} className="fs-result">
                  <div className="fs-result-top">
                    <span className="fs-result-name" title={r.fileName}>{r.fileName}</span>
                    <span
                      className="fs-result-rank"
                      title={t('verify.rankHint', { rank: String(rank) })}
                    >
                      #{rank}
                    </span>
                  </div>
                  <div className="fs-result-meta">
                    {r.fileType && <span className="fs-tag">{r.fileType}</span>}
                    {formatBytes(r.fileSize) && <span className="fs-muted">{formatBytes(r.fileSize)}</span>}
                    {formatDate(r.modifiedAt, dateLocale) && (
                      <span className="fs-muted">
                        {t('verify.updatedAt', { date: formatDate(r.modifiedAt, dateLocale) })}
                      </span>
                    )}
                  </div>
                  <div className="fs-result-path">{r.filePath}</div>
                  {SHOW_FS_SUMMARY && <div className="fs-result-summary" />}
                </li>
                )
              })}
            </ul>
          )}
        </div>
      </section>
    </div>
  )
}
