/**
 * English locale resource (source of truth for the key shape).
 *
 * 术语表（与 bibit 宿主保持一致）：
 *   知识库路径   = Knowledge base paths
 *   索引深度     = Index depth
 *   检索返回条数 = Top-K results
 *   排除规则     = Exclude patterns
 *   自动索引     = Auto index
 *   支持的格式   = Supported formats
 *
 * `title` / `description` 对应 bibit.feature.json 的 display.titleKey /
 * descriptionKey（filesearch:title / filesearch:description），由宿主渲染导航项；
 * 其余键由插件内部渲染使用。
 */
export const en = {
  title: 'File Search',
  description: 'Index and search local documents (bibit-filesearch standalone service)',
  subtitle: 'Manage the local document index (bibit-filesearch standalone service)',
  refreshStatus: 'Refresh status',
  // Click feedback, three phases (refreshing / refreshed / failed).
  // Without it a click has no visible effect, so you cannot tell "nothing happened" from "that is all it does".
  // 状态机见 src/refreshFeedback.ts。
  refreshStatusBusy: 'Refreshing…',
  refreshStatusDone: 'Refreshed',
  refreshStatusFail: 'Refresh failed',

  serviceDown: {
    title: 'Cannot reach the local search service',
    body: 'Make sure the bibit-filesearch service is running ({{baseUrl}}). You can still edit the configuration here; click "Save & Index" once the service is back.',
  },
  retry: 'Retry',

  // embed dependency unavailable is folded into the status semantics, not a separate banner
  // （见 pill.embedDown / status.embedDownReason）——状态格本就该反映索引可用性。
  status: {
    embedDownReason: 'Embedding service not running: {{embedUrl}}',
    failedReason: '{{count}} file(s) failed to index',
  },

  failedFiles: {
    toggle: 'View details ({{count}})',
    hide: 'Hide details',
    empty: 'No details recorded for this scan',
    dbOnly: '{{count}} more file(s) failed earlier and were not retried in this pass (recorded in the database).',
    kindPermission: 'Permission',
    kindEmbed: 'Embedding service',
    kindParse: 'Parse',
    kindOther: 'Other',
    /** The panel needs its own label (otherwise both panels look identical). */
    panelTitle: 'Failed files',
    /** Filename not UTF-8 — backend sends facts (kind/encoding/guess/bytes), wording here. */
    kindFilename: 'Filename',
    reasonUnencodable:
      'The filename is not UTF-8, so it cannot be indexed. It reads as "{{guess}}" in {{encoding}} — rename it and scan again.',
    // Parse / OCR failures get a sentence in the
    // active language instead of the library's raw English error.
    reasonParseFailed: 'Could not parse the file: {{detail}}',
    reasonOcrFailed: 'Text recognition failed: {{detail}}',
    reasonUnencodableFull:
      'The filename is not UTF-8, so it cannot be indexed. It reads as "{{guess}}" in {{encoding}} — rename it and scan again. Raw bytes: {{bytes}}',
  },

  /**
   * The counterpart panel to "failed files" — the "not indexed" cell
   * is now clickable and lists which files were left out, and why.
   * The backend only sends a category (kind / reason); wording lives here.
   */
  notIndexedFiles: {
    toggle: 'View details ({{count}})',
    hide: 'Hide details',
    empty: 'No not-indexed files right now',
    countOnly: '{{count}} file(s) are not indexed (details for this pass are not available yet — try expanding again shortly).',
    truncatedNote: 'Showing the first {{shown}} of {{total}}.',
    kindRule: 'Matched an exclude rule',
    kindDepth: 'Beyond the index depth',
    kindType: 'Type not selected',
    kindTypeWithExt: 'Type not selected ({{ext}})',
    kindNoText: 'No extractable text',
    kindOther: 'Not indexed',
    /** Distinct panel label. */
    panelTitle: 'Not-indexed files',
    /** Per-row explanation, so this panel's rows have the same three columns as the failures. */
    reasonRule: 'Matched an exclude rule, so it is not indexed.',
    reasonDepth: 'Beyond the index depth, so it is not indexed.',
    reasonType: 'Its file type is not selected, so it is not indexed.',
    reasonNoText: 'No text could be extracted, so it is not indexed.',
    reasonOther: 'Not part of this index pass.',
    /** Now only the hover hint on the count, not a separate row. */
    summary: '{{count}} in total ({{parts}})',
    summaryJoiner: ', ',
  },
  // A "partially indexed" group is intentionally not shown (content incompleteness is not surfaced to end users).
  // (it is internal detail, not something to show end users). The data is still served by
  // the backend at vectorizePhase.truncated / truncationDetails for debugging.,

  stats: {
    aria: 'Index status overview',
    status: 'Status',
    indexed: 'Indexed files',
    queued: 'Pending',
    notIndexed: 'Not indexed',
    notIndexedHint:
      'Files that exist in the knowledge base folders but were never indexed: type not selected, no extractable text (e.g. scanned PDFs), matched an exclude rule, beyond the depth limit, or outside the knowledge base path.',
    failed: 'Failed',
    progressAria: 'Indexing progress {{pct}}%',
    progressWalking: 'Scanning for files {{done}} / {{total}}',
    progressFiles: '{{done}} of {{total}} processed ({{pending}} left)',
  },

  pill: {
    down: 'Service unavailable',
    connecting: 'Connecting…',
    done: 'Completed',
    scanning: 'Scanning',
    paused: 'Paused',
    error: 'Index error',
    idle: 'Service healthy',
    embedDown: 'Index service unavailable',
    doneWithFailures: 'Completed',
  },

  config: {
    aria: 'Index configuration',
    title: 'Index configuration',
    save: 'Save & Index',
    saving: 'Saving…',
    unsaved: 'Unsaved changes',
  },

  // Restore defaults (in-place two-step confirm, no native confirm dialog)
  reset: {
    button: 'Restore defaults',
    confirm: 'Click again to confirm',
    resetting: 'Restoring…',
    hint: 'Clear every customised setting and fall back to the built-in defaults',
    warning: 'This clears all customised settings (paths, depth, Top-K, exclude patterns, formats, auto index) and falls back to the defaults. Files outside the default paths are removed from the index. Click the button again to confirm.',
    cancel: 'Cancel',
    done: 'Defaults restored. Rescanning and rebuilding the index.',
  },

  errors: {
    readConfig: 'Failed to load the current configuration: {{message}}',
    pathRequired: 'Provide at least one knowledge base path',
    dirInvalidPrefix: 'Knowledge base paths: ',
  },

  notices: {
    saved: 'Configuration saved. Rescanning and rebuilding the index.',
    rescanned: 'Configuration unchanged; re-scanned the index',
  },

  scope: {
    title: 'Scan scope',
  },

  paths: {
    label: 'Knowledge base paths',
    hint: 'Multiple directories supported; one absolute path per line',
  },

  depth: {
    label: 'Index depth',
    hint: '0 = unlimited depth; 1 = current directory only (no subdirectories); 2 = current directory + 1 level of subdirectories; N = current directory + N-1 levels of subdirectories',
  },

  topK: {
    label: 'Top-K results',
    hint: 'Maximum number of results returned per search',
  },

  exclude: {
    title: 'Exclude patterns',
    label: 'Ignored directories and files',
    hint: 'One glob pattern per line; matching paths are not indexed',
  },

  formats: {
    title: 'Supported formats',
    hint: 'Only the checked file formats are indexed into the knowledge base',
    selected: '{{selected}} / {{total}} selected',
    selectAll: 'Select all',
    clear: 'Clear',
    groups: {
      docs: 'Documents',
      code: 'Code',
      sheets: 'Sheets / Slides',
      images: 'Images',
      imagesTip: 'Extracts text from images (slower); image text is not searchable unless enabled',
    },
  },

  autoIndex: {
    label: 'Auto index',
    hint: 'When enabled, knowledge base directories are watched and additions, edits, and deletions update the index in real time — no manual rebuild needed',
    on: 'On',
    off: 'Off',
  },

  verify: {
    aria: 'Search verification',
    title: 'Search verification',
    matches: '{{count}} matches',
    rankHint: 'Ranked {{rank}} by relevance in this search — a position, not a match percentage',
    placeholder: 'Enter keywords (English or Chinese), e.g. GTK window rendering, GPU texture compression',
    search: 'Search',
    searching: 'Searching…',
    loading: 'Searching the local index…',
    empty: {
      title: 'No search yet',
      descDown: 'Once the service is back, enter keywords above to verify the index',
      desc: 'Search is a keyword/semantic query (not a chat). Enter something like "GTK window rendering" to verify the index',
    },
    noResults: {
      title: 'No matching content found',
      desc: 'Try different keywords; if the content is under a knowledge base path, click "Save & Index" to rebuild the index and try again',
    },
    updatedAt: 'Updated {{date}}',
  },
}

export type EnResource = typeof en

/** 把嵌套资源展平成点分键联合类型（'verify.empty.title' …）。 */
type Paths<T> = {
  [K in keyof T & string]: T[K] extends string ? K : `${K}.${Paths<T[K]>}`
}[keyof T & string]

/** 编译期键集合：FilesearchPage 里 t() 的 key 必须是其中之一。 */
export type LocaleKey = Paths<EnResource>

/** 深结构一致（键相同、叶子均为 string），用于强制 zh-CN 与 en 键对齐。 */
export type LocaleShape<T> = {
  [K in keyof T]: T[K] extends string ? string : LocaleShape<T[K]>
}
