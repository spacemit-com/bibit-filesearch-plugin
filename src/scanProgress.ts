/**
 * 扫描进度条的展示口径（纯函数，便于单测）。
 *
 * 现象：「扫描中」却显示 `118/118` 文件，看上去像扫描完了。
 * 根因是**两个阶段共用一个字段的语义**：那行文字取 `scanPhase.walked/total`
 * （遍历阶段，os.walk 发现文件，118 个文件约 8 秒就完），而进度条取
 * `vectorizePhase`（真正耗时的向量化，同样 118 个文件要数小时）。于是遍历一结束
 * 文字就定格 `118 / 118`，而 `status` 仍是 scanning（等向量化）——两者长期同屏矛盾。
 *
 * 本模块把口径收成一处：**进度只看向量化**（`done / total`），遍历另有专门的措辞
 * （「正在遍历文件 x / N」），并且只在遍历真没走完时出现。
 *
 * 另两个计数缺口（后端已补）：`vectorizing` 不在任何一格会导致
 * 三数之和 ≠ 文件数；`unsupported`（无文本/纯图 PDF）若不参与分子，进度永远到不了 100%。
 */

/** 遍历阶段（os.walk 发现文件，快）。 */
export interface WalkPhaseView {
  walked?: number
  total?: number
  errors?: number
  /**
   * 未纳入索引的文件数（后端字段 `notIndexedPhase`）：命中排除规则 / 超出索引深度 /
   * 格式没勾 / 未知扩展名。这类文件**连索引池的行都没有**，四个观测面全静默
   * ——「我的文件怎么没被索引」最常见的答案就在这里。
   */
  excluded?: number
}

/** 向量化阶段（算向量，慢）。 */
export interface VectorizePhaseView {
  /** files 表总行数（= 各状态之和），进度分母 */
  total?: number
  queued?: number
  /** 正在算的那个（在飞） */
  vectorizing?: number
  /**
   * 「待向量化」统计格的**权威值**（后端 `pendingTotal`）。
   *
   * = 索引池中 queued + vectorizing 的行数，即「还有多少文件没算完」。
   * 后端两条路径（全盘扫描 + 增量）现在都写池行，所以这个数精确等于库里
   * 未算完的行数。
   *
   * 此前前端要自己拼 `queued + vectorizing + inflight`，而那个 `inflight`
   * 是进程内计数、挂在两条路径的公共入口上 → **同一个文件被数两遍**
   * （实测：8 个文件的库算出 pending = 9，比总行数还大）。见 scanProgressView。
   */
  pending?: number
  /**
   * 正在索引、**尚未登记进池**的文件数。
   *
   * 语义收窄后的窗口只剩「消费者刚从池中取走、index_file 还没写完」，
   * 界面上是 0 或 1。**不要再把它加进「待向量化」**（那是重复计数的来源）；
   * 它只用于判断「此刻有没有活在干」。
   */
  inflight?: number
  completed?: number
  failed?: number
  /** 无文本 / 纯图片 PDF：已处理完但不产生向量 */
  unsupported?: number
  /** unsupported 细分：解析了但读不出文本 */
  unsupportedNoText?: number
  /** unsupported 细分：格式没勾 / 未知扩展名 */
  unsupportedType?: number
}

export interface ScanProgressView {
  /** 遍历还没走完：此时向量化计数是**上一轮的存量**，不能当进度显示 */
  walking: boolean
  walkDone: number
  walkTotal: number
  /** 已处理 = completed + failed + unsupported */
  done: number
  /** 待处理 = queued + vectorizing */
  pending: number
  total: number
  /** 已处理 / 总数，0~100（队列排空时正好 100） */
  pct: number
  /**
   * 「待向量化」统计格要显示的数 = 池中未算完的行数（queued + vectorizing）。
   *
    * **不要自拼 `pending + inflight`**：把进程内计数加到库计数上会重复计数——
    * scanner 正在算的文件**既有库行（vectorizing）又被计入 inflight**，同一个文件
    * 数两遍（隔离环境 8 个 md 的库会算出 9，比总行数还大）。
    * 后端直接给 `vectorizePhase.pending`，本数即它。
   */
  pendingTotal: number
  /**
   * 未纳入索引的文件数（排除规则 / 超出索引深度 / 不在知识库路径内）。
   * 这类文件不进池、没有行、不进错误明细——此前四个观测面全静默。
   */
  excluded: number
  /** 画进度条：只在向量化阶段（遍历期间拿到的是旧账，画出来会出现「100% + 扫描中」） */
  showBar: boolean
  /** 显示「正在遍历文件 x / N」 */
  showWalkLine: boolean
  /** 显示「已处理 x / N 个文件（待 P）」 */
  showProcessedLine: boolean
}

/** 「未纳入索引」明细的一条（后端 notIndexedPhase.details 的元素）。 */
export interface NotIndexedItemView {
  path?: string
  /** rule = 命中排除规则；depth = 超出索引深度 */
  kind?: string
  /** type = 格式没勾选；noText = 解析不出文字 */
  reason?: string
  fileType?: string
}

/**
 * 「未纳入索引」的权威来源（后端 `notIndexedPhase`）。
 *
 * 它把两个来源合并：遍历侧（被排除规则剪枝 / 超出索引深度，连库行都没有）
 * 与库侧（`vectorize_status='unsupported'`，有行但没向量）。
 * `total` 是全量真值；`details` 是**样本**（后端有上限），
 * `detailsTruncated` 为真时界面必须如实说明「只列出前 N 条」。
 */
export interface NotIndexedPhaseView {
  total?: number
  details?: NotIndexedItemView[]
  detailsTruncated?: boolean
  /** 原因细分计数：rule / depth / type / noText */
  byKind?: Record<string, number>
}

const num = (v: number | undefined): number => (typeof v === 'number' && v > 0 ? v : 0)

/**
 * 「未纳入索引」格的取值口径（纯函数，便于单测）。
 *
 * 后端 `notIndexedPhase` 把「遍历侧被排除 / 超深度」与「库侧 unsupported」合并成一个
 * 出口，数 + 明细同源。前端**只读那一个数**，不要自己拼
 * `scanPhase.excluded + vectorizePhase.unsupported` —— 那份拼装会让「格上的数」和
 * 「展开的明细」可能不同源。
 *
 * 老后端（无 `notIndexedPhase`）兜底：退回两处相加。
 */
export function notIndexedTotalOf(
  scanPhase: WalkPhaseView | undefined | null,
  vectorizePhase: VectorizePhaseView | undefined | null,
  notIndexedPhase?: NotIndexedPhaseView | undefined | null,
): number {
  if (typeof notIndexedPhase?.total === 'number') {
    return Math.max(0, notIndexedPhase.total)
  }
  return num(scanPhase?.excluded) + num(vectorizePhase?.unsupported)
}

export function scanProgressView(
  scanPhase: WalkPhaseView | undefined | null,
  vectorizePhase: VectorizePhaseView | undefined | null,
  opts: { scanning: boolean; serviceUp: boolean | null },
): ScanProgressView {
  const walkDone = num(scanPhase?.walked)
  const walkTotal = num(scanPhase?.total)
  // 遍历没走完（含「刚重启、walk_total 还是上一轮的值」这种：walked 已复位为 0）
  const walking = walkTotal > 0 && walkDone < walkTotal

  const total = num(vectorizePhase?.total)
  const done = num(vectorizePhase?.completed) + num(vectorizePhase?.failed) + num(vectorizePhase?.unsupported)
  // 进度行的「待」：池中排队 + 在算（不含尚未登记的，因为它没有分母）
  const pending = num(vectorizePhase?.queued) + num(vectorizePhase?.vectorizing)
  const pct = total > 0 ? Math.min(100, Math.round((done / total) * 100)) : 0

  const live = Boolean(opts.serviceUp) && opts.scanning
  const inVectorizePhase = !walking && total > 0
  // watcher 增量索引期间（有在飞、但没走 scanner 队列）：此时 total 是上一轮全盘
  // 扫描的存量，画进度会得到「已处理 N / N + 扫描中」。这一路不画条、不报「已处理」，
  // 只让状态格说「扫描中」（契约 §2、§5）。
  //
  // 增量也写池行后，「有没有活在干」用池行就看得到（pending > 0）；
  // 这个判据只保留给「老后端 + 有在飞」的兼容。
  const incremental = !walking && num(vectorizePhase?.inflight) > 0 && pending === 0
  // 「待向量化」统计格：**直接读后端的权威值**。
  //
  // 不要改回自拼 `pending + inflight`（把进程内计数加到库计数上）：scanner 正在算的
  // 文件既有库行（vectorizing）又被计入 inflight → **同一个文件数两遍**，
  // 8 个文件的库会算出 9（比总行数还大）。
  // 后端直接给 `vectorizePhase.pending`（池中 queued + vectorizing 的行数），用它就够；
  // `inflight` 退化为纯「此刻有没有活在干」的信号。
  //
  // 老后端（没这个字段）兜底：退回 queued + vectorizing（**不加 inflight**，
  // 宁可少算也不重复计数）。
  const pendingTotal = typeof vectorizePhase?.pending === 'number'
    ? num(vectorizePhase.pending)
    : pending
  // 未纳入索引（排除规则 / 超出深度 / 不在知识库路径内）：连行都没有，只能后端给
  const excluded = num(scanPhase?.excluded)

  return {
    walking,
    walkDone,
    walkTotal,
    done,
    pending,
    total,
    pct,
    pendingTotal,
    excluded,
    showBar: live && inVectorizePhase && !incremental,
    showWalkLine: live && walking,
    showProcessedLine: live && inVectorizePhase && !incremental,
  }
}
