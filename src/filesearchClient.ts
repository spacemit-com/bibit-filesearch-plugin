/**
 * bibit-filesearch HTTP 客户端。
 *
 * 调用本地 bibit-filesearch 服务（默认 127.0.0.1:18700）。
 * 响应统一 {code, message, data} 三层包装（见 bibit-filesearch/docs/api-contract.md）。
 */

export interface FilesearchSettings {
  index_dirs: string[]
  auto_index: boolean
  indexable_types: string[]
  exclude_patterns: string[]
  max_depth: number
  top_k: number
  [key: string]: unknown
}

export interface FilesearchResult {
  fileId: string
  fileName: string
  filePath: string
  fileType: string
  fileSize: number
  createdAt: string
  modifiedAt: string
  author: string
  confidence: number
}

export interface SearchResponse {
  total: number
  page: number
  pageSize: number
  totalPages: number
  results: FilesearchResult[]
}

/**
 * 「未纳入索引」的一条明细。
 *
 * `kind` 与 `reason` 都只给**分类**，文案由 locales 按语言给出（与 failedFiles.kind* 同做法）：
 *   kind=rule    命中排除规则
 *   kind=depth   超出索引深度
 *   reason=type  格式没勾选（fileType 给出是哪种）
 *   reason=noText 解析了但读不出文本（如扫描版 PDF）
 */
export interface NotIndexedItem {
  path?: string
  kind?: 'rule' | 'depth'
  reason?: 'type' | 'noText'
  fileType?: string
}

export interface ScanProgress {
  status: 'idle' | 'scanning' | 'paused' | 'done' | 'error'
  scanPhase: {
    walked: number
    total: number
    errors: number
    errorDetails: { kind?: string; path?: string; reason?: string }[]
    /**
     * 未纳入索引的文件数（后端字段 `notIndexedPhase`）：命中排除规则 / 超出索引深度 /
     * 格式没勾 / 未知扩展名。这类文件连索引池的行都没有，四个观测面全静默。
     */
    excluded?: number
  }
  /**
   * 「未纳入索引」格的**唯一**数据源。
   *
   * 为什么单独一节，而不是把明细塞进 scanPhase / vectorizePhase：
   * 用户看到的「未纳入索引」是一个概念，后端却有两个来源（遍历侧被排除/超深度、
   * 库侧 unsupported）。合并成一个出口后，前端不必自己拼两处、也不必自己判原因。
   *
   * `total` 是权威计数；`details` 是明细样本（有上限，见 detailsTruncated）。
   */
  notIndexedPhase?: {
    total?: number
    details?: NotIndexedItem[]
    /** 明细只列了前若干条：界面必须如实说明「还有 N 条未列出」 */
    detailsTruncated?: boolean
    /** 原因细分计数：rule / depth / type / noText */
    byKind?: Record<string, number>
  }
  vectorizePhase: {
    /** files 表总行数；进度基准的分母（= 各状态之和） */
    total?: number
    queued: number
    /** 正在向量化（在飞）。缺了它三数之和 ≠ 文件数 */
    vectorizing?: number
    completed: number
    failed: number
    /** 无文本/纯图片 PDF：已处理完但不产生向量。缺了它进度到不了 100% */
    unsupported?: number
    /** 被单文件块数上限截断的文件数（**不是失败**：已索引的块可检索） */
    truncated?: number
    /**
     * 「待向量化」格的权威值（后端 `pendingTotal`）：索引池中
     * queued + vectorizing 的行数。**不要再自己拼 queued+vectorizing+inflight**
     * —— 那会把同一个文件数两遍（见 src/scanProgress.ts）。
     */
    pending?: number
    /**
     * 正在索引、**尚未登记进池**的文件数。池子化后语义收窄为「消费者刚从池中
     * 取走、还没写完」这个瞬间，只用来判断「此刻有没有活在干」。
     */
    inflight?: number
    /** unsupported 细分：解析了但读不出文本 */
    unsupportedNoText?: number
    /** unsupported 细分：格式没勾 / 未知扩展名 */
    unsupportedType?: number
    /** 与 truncated 同源同长；indexed < total 表示内容不全 */
    truncationDetails?: { path?: string; indexed: number; total: number }[]
  }
}

export interface FilesearchHealth {
  status: string
}

/** GET /health/deep：db/embed 依赖探测 + 索引计数。 */
export interface FilesearchHealthDeep {
  status: 'ok' | 'degraded' | 'error'
  db: string
  embed: string
  /** embed 服务地址（降级横幅显示用） */
  embedUrl?: string
  /**
   * 细分为 `...` 几项。
   *
   * 它们是死字段——后端 `/health/deep` 一直在返回（`db.count_files()` 全表 COUNT
   * 与内存里的 _errorLogs.length），但**前端从未引用**（grep 零调用点），
   * 而同一份 DB 的计数在 /api/scan/progress 里另有一套算法在产。
   * 「同一事实两种来源」正是本次要消掉的东西；需要索引计数就用
   * `/api/scan/progress` 的 vectorizePhase。
   */
}

export class FilesearchError extends Error {
  code: number
  constructor(code: number, message: string) {
    super(message)
    this.code = code
  }
}

/**
 * 端口派生：uid<1000 → 18700；uid≥1000 → 18700+(uid-1000)
 * （uid 1000→18700、uid 1001→18701…；deb 部署的 user 服务对 uid 1000 也用 18700）。
 * 浏览器环境拿不到 uid（宿主未下发 hostUid）时回退默认 18700。
 */
export function baseUrlForUid(uid?: number): string {
  let port = 18700
  if (uid !== undefined && uid >= 1000) {
    port = 18700 + (uid - 1000)
  }
  return `http://127.0.0.1:${port}`
}

export class FilesearchClient {
  private baseUrl: string

  constructor(baseUrl?: string) {
    this.baseUrl = baseUrl ?? baseUrlForUid()
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    })
    if (!res.ok) {
      throw new FilesearchError(-1, `HTTP ${res.status} ${res.statusText}`)
    }
    const payload = (await res.json()) as { code: number; message: string; data: T | null }
    if (payload.code !== 0) {
      throw new FilesearchError(payload.code, payload.message ?? 'unknown error')
    }
    return payload.data as T
  }

  /** GET /health */
  health(): Promise<FilesearchHealth> {
    return this.request('GET', '/health')
  }

  /** GET /health/deep */
  healthDeep(): Promise<FilesearchHealthDeep> {
    return this.request('GET', '/health/deep')
  }

  /** GET /api/settings */
  getSettings(): Promise<FilesearchSettings> {
    return this.request('GET', '/api/settings')
  }

  /** PUT /api/settings（partial，幂等；返回更新后配置 + changed 标记） */
  updateSettings(partial: Partial<FilesearchSettings>): Promise<FilesearchSettings & { changed: boolean }> {
    return this.request('PUT', '/api/settings', partial)
  }

  /**
   * POST /api/settings/reset —— 恢复出厂默认。
   *
   * 服务端清空用户配置文件里所有自定义键，生效值回落代码默认
   * （index_dirs 走动态默认 ~/Desktop + ~/Documents），并无条件重扫。
   * 返回恢复后的完整生效设置。
   */
  resetSettings(): Promise<FilesearchSettings> {
    return this.request('POST', '/api/settings/reset', {})
  }

  /** POST /api/search */
  search(query: string, filters?: Record<string, unknown>, page = 1, pageSize = 10): Promise<SearchResponse> {
    return this.request('POST', '/api/search', { query, filters, page, pageSize })
  }

  /** POST /api/scan */
  triggerScan(): Promise<{ status: string; message: string }> {
    return this.request('POST', '/api/scan', {})
  }

  /** GET /api/scan/progress */
  scanProgress(): Promise<ScanProgress> {
    return this.request('GET', '/api/scan/progress')
  }

  /** POST /api/scan/pause */
  pauseScan(): Promise<{ status: string; message: string }> {
    return this.request('POST', '/api/scan/pause', {})
  }

  /** POST /api/scan/resume */
  resumeScan(): Promise<{ status: string; message: string }> {
    return this.request('POST', '/api/scan/resume', {})
  }
}
