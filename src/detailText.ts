/**
 * 明细条目 → 展示用文本（纯函数，便于单测）。
 *
 * 为什么需要：
 *   界面切成英文后，「失败文件」面板里那行原因**仍然是中文**，而且很长。根因是后端
 *   把整句话拼好塞进 `errorDetails[].reason`（`pathutil.describe_unencodable_filename`
 *   返回中文句子、`model_client` 的 EmbedError 也是中文），前端原样打印 —— 后端不该
 *   决定文案语言。
 *
 * 现在后端的约定：
 *   · 「文件名不是 UTF-8」这类需要**按语言解释**的原因，reason 里放结构化标记
 *     `filenameUnencodable:{"kind":...,"encoding":...,"guess":...,"base":...}`；
 *   · 其余（embed 服务过载、解析异常…）是**服务侧技术细节**，无法翻译，
 *     保留原始消息最有价值 —— 原样显示。
 *
 * 本模块把这条约定收成一处，UI 只调 `failureReasonText` / `failureReasonFullText`。
 */

import type { LocaleKey } from './locales'

/** 结构化原因标记的前缀（与后端 scanner/watcher/pool 三处一致）。 */
export const REASON_MARKER_PREFIX = 'filenameUnencodable:'

/** 解析 / OCR 失败的结构化标记（与后端 parser.py 成对）。 */
export const PARSE_FAILED_PREFIX = 'parseFailed:'
export const OCR_FAILED_PREFIX = 'ocrFailed:'

/** 结构化原因的内容（后端 JSON 解出来的形状）。 */
export interface UnencodableFilenameReason {
  kind?: string
  /** 试出来的编码，如 gb18030；试不出则空串 */
  encoding?: string
  /** 按该编码读出来的路径（人眼可读） */
  guess?: string
  /** 原始字节的 repr（排查用，平时不显示） */
  base?: string
}

/** 解析结构化原因；不是这个标记就返回 null。 */
export function parseUnencodableReason(reason?: string | null): UnencodableFilenameReason | null {
  if (!reason || !reason.startsWith(REASON_MARKER_PREFIX)) return null
  const raw = reason.slice(REASON_MARKER_PREFIX.length)
  try {
    const parsed = JSON.parse(raw) as UnencodableFilenameReason
    return parsed && typeof parsed === 'object' ? parsed : null
  } catch {
    // 标记在但 JSON 坏了：不要因此把整行丢掉，回退为「显示原文」
    return null
  }
}

/**
 * 取词函数的最小形状（与 locales/index.ts 的 `TranslateOptions` 一致）。
 *
 * 关键点是 `key: LocaleKey` —— 键在编译期受检，所以本模块里写错键名会直接编译失败
 * （这是这次改动想保住的属性：文案散落在多个模块时，最容易出的错就是键名打错、
 * 界面显示成键名本身而没人发现）。
 */
export type Translate = (
  key: LocaleKey,
  options?: Readonly<Record<string, string | number>>,
) => string

/**
 * 原因短文本（列表里显示）。
 * 结构化原因 → 按语言出词；其余 → 原样返回（技术细节，翻译反而丢信息）。
 *
 * 除 `filenameUnencodable:` 外还有 `parseFailed:` / `ocrFailed:` 两类。
 * 现场：用户界面选中文，明细里那一行仍是英文
 * `Failed to open file '/…/mm02-fake.pdf' as type pdf.` —— 后端把库的原始报错
 * 当句子直接输出，界面只能原样打。现在后端只给结构化事实（kind + 错误类型 +
 * 原文），这里拼成「中文壳 + 原文细节」：既不与语言设置打架，又不丢排障线索。
 */
export function failureReasonText(reason: string | undefined, t: Translate): string {
  const info = parseUnencodableReason(reason)
  if (info) {
    return t('failedFiles.reasonUnencodable', {
      encoding: info.encoding || '?',
      guess: info.guess || '?',
    })
  }
  const structured = parseStructuredFailure(reason)
  if (structured) {
    const detail = structured.detail || structured.errorType || ''
    return structured.kind === 'ocrFailed'
      ? t('failedFiles.reasonOcrFailed', { detail })
      : t('failedFiles.reasonParseFailed', { detail })
  }
  return reason ?? ''
}

/**
 * 解析 `parseFailed:` / `ocrFailed:` 标记（与后端 `parser.py` 成对）。
 * 认不出（无标记 / JSON 坏）→ null，调用方回退显示原文
 * —— 与 `parseUnencodableReason` 同一容错策略，绝不因格式问题丢整行。
 */
export function parseStructuredFailure(
  reason?: string | null,
): { kind: string; errorType?: string; detail?: string } | null {
  if (!reason) return null
  const prefix = reason.startsWith(OCR_FAILED_PREFIX)
    ? OCR_FAILED_PREFIX
    : reason.startsWith(PARSE_FAILED_PREFIX)
      ? PARSE_FAILED_PREFIX
      : ''
  if (!prefix) return null
  try {
    const parsed = JSON.parse(reason.slice(prefix.length)) as {
      kind?: string
      errorType?: string
      detail?: string
    }
    if (!parsed || typeof parsed !== 'object') return null
    return {
      kind: parsed.kind || (prefix === OCR_FAILED_PREFIX ? 'ocrFailed' : 'parseFailed'),
      errorType: parsed.errorType,
      detail: parsed.detail,
    }
  } catch {
    return null
  }
}

/** 悬停时的完整文本（多带原始字节，排查用）。 */
export function failureReasonFullText(reason: string | undefined, t: Translate): string {
  const info = parseUnencodableReason(reason)
  if (!info) return reason ?? ''
  return t('failedFiles.reasonUnencodableFull', {
    encoding: info.encoding || '?',
    guess: info.guess || '?',
    bytes: info.base || '',
  })
}

/**
 * 失败明细的**分类标签**：结构化原因有自己的标签（「文件名」），其余按 kind 映射。
 * 这样用户在列表里一眼能看出「这条不是解析问题，是文件名问题」。
 */
export function failureKindLabel(
  kind: string | undefined,
  reason: string | undefined,
  t: Translate,
): string {
  if (parseUnencodableReason(reason)) return t('failedFiles.kindFilename')
  if (kind === 'permission') return t('failedFiles.kindPermission')
  if (kind === 'embed') return t('failedFiles.kindEmbed')
  if (kind === 'parse') return t('failedFiles.kindParse')
  return t('failedFiles.kindOther')
}

/** 「未纳入索引」明细的分类标签（后端只给 kind / reason 分类）。 */
export function notIndexedKindLabel(
  d: { kind?: string; reason?: string; fileType?: string },
  t: Translate,
): string {
  if (d.kind === 'rule') return t('notIndexedFiles.kindRule')
  if (d.kind === 'depth') return t('notIndexedFiles.kindDepth')
  if (d.reason === 'type') {
    return d.fileType
      ? t('notIndexedFiles.kindTypeWithExt', { ext: d.fileType })
      : t('notIndexedFiles.kindType')
  }
  if (d.reason === 'noText') return t('notIndexedFiles.kindNoText')
  return t('notIndexedFiles.kindOther')
}

/**
 * 「未纳入索引」明细的**右侧说明句**。
 *
 * 为什么单独有这个函数：该面板与「失败文件」面板共用同一套结构与列轨道，说明句也按同一
 * 方式按语言出词（而不是各写一套）。
 * 实测差在两处 —— ① 本面板标题行多一个汇总块；② 本面板每行只有「标签 + 路径」两列，
 * 而失败面板每行是「标签 + 路径 + 右侧说明」三列，于是行高 20px 对 37/55px，
 * 看起来空、稀疏、跟失败面板不像一对。
 *
 * 现在本面板每行也补一列说明句，结构即与失败面板逐项对齐。汇总句不再单独占一行，
 * 改为挂在标题行计数上作悬停提示（不改变视觉结构）。
 */
export function notIndexedReasonText(
  d: { kind?: string; reason?: string; fileType?: string },
  t: Translate,
): string {
  if (d.kind === 'rule') return t('notIndexedFiles.reasonRule')
  if (d.kind === 'depth') return t('notIndexedFiles.reasonDepth')
  if (d.reason === 'type') return t('notIndexedFiles.reasonType')
  if (d.reason === 'noText') return t('notIndexedFiles.reasonNoText')
  return t('notIndexedFiles.reasonOther')
}

/**
 * 「未纳入索引」原因汇总（面板顶部一句话）：按原因分组、组间用「、」连接。
 * 例：`共 7 个（命中排除规则 5、格式未勾选 2）`
 */
export function notIndexedSummaryText(
  byKind: Record<string, number> | undefined,
  total: number,
  t: Translate,
): string {
  const label = (key: string): string => {
    if (key === 'rule') return t('notIndexedFiles.kindRule')
    if (key === 'depth') return t('notIndexedFiles.kindDepth')
    if (key === 'type') return t('notIndexedFiles.kindType')
    if (key === 'noText') return t('notIndexedFiles.kindNoText')
    return t('notIndexedFiles.kindOther')
  }
  const parts = Object.entries(byKind ?? {})
    .filter(([, n]) => Number(n) > 0)
    .map(([k, n]) => `${label(k)} ${n}`)
  return t('notIndexedFiles.summary', {
    count: total,
    parts: parts.join(t('notIndexedFiles.summaryJoiner')),
  })
}
