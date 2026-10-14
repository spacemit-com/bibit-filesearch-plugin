/**
 * 扫描进度口径单测（node --test，经 scripts/run-tests.mjs 打包）。
 *
 * 2026-09-21 用户报：「扫描中为什么显示 118/118 文件，看上去像扫描完了」。
 * 根因 = 进度条取 vectorizePhase（向量化，慢），旁边那行文字取 scanPhase.walked/total
 * （遍历，快）→ 遍历 8 秒跑完，文字就定格 118/118，而状态还是「扫描中」。
 *
 * 本文件锁定：**进度只看向量化一个基准**，遍历另有措辞且只在真没走完时出现；
 * 并守住两个计数缺口（vectorizing 不落格、unsupported 不参与分子）。
 *
 * 2026-09-22 续（后端 0.1.17 起 status 覆盖 watcher 增量路径）：
 * 增量索引期间 total 是**上一轮全盘扫描的存量**，照旧画进度会出现
 * 「已处理 9 / 9（待 0）」+「扫描中」的自相矛盾。故新增判据：有在飞增量
 * 且队列为空时，不画条、不报「已处理」。下面最后一组用例锁定它。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'

import { scanProgressView, notIndexedTotalOf } from '../src/scanProgress.ts'

const LIVE = { scanning: true, serviceUp: true }

/** 用户实测现场：遍历已完成（118/118），向量化才走了 50/118。 */
const REPORTED = {
  scanPhase: { walked: 118, total: 118 },
  vectorizePhase: { total: 118, queued: 67, vectorizing: 1, completed: 49, failed: 1, unsupported: 0 },
}

test('★ 回归：扫描中不再出现「118/118」——遍历走完就只显示已处理进度', () => {
  const v = scanProgressView(REPORTED.scanPhase, REPORTED.vectorizePhase, LIVE)
  assert.equal(v.walking, false, '遍历已走完')
  assert.equal(v.showWalkLine, false, '不该再显示 118 / 118 这种遍历数字')
  assert.equal(v.showProcessedLine, true)
  assert.deepEqual([v.done, v.total, v.pending], [50, 118, 68], '已处理 50 / 共 118（待 68）')
  assert.equal(v.pct, 42, '进度条 42%：与文字同一基准')
})

test('★ 遍历未走完时才显示遍历行，且不画进度条（避免拿上一轮的满进度）', () => {
  const v = scanProgressView(
    { walked: 37, total: 118 },
    REPORTED.vectorizePhase,          // 此刻这些计数还是**上一轮**的存量
    LIVE,
  )
  assert.equal(v.walking, true)
  assert.equal(v.showWalkLine, true)
  assert.equal(v.showBar, false, '此时画条会显示上一轮 100% 而状态是扫描中')
  assert.equal(v.showProcessedLine, false, '存量的已处理数不该当成本轮进度')
  assert.deepEqual([v.walkDone, v.walkTotal], [37, 118])
})

test('刚重启扫描：walked 已复位为 0，walk_total 还是上一轮的值 → 仍算遍历中', () => {
  const v = scanProgressView({ walked: 0, total: 118 }, { total: 118, completed: 118 }, LIVE)
  assert.equal(v.walking, true)
  assert.equal(v.showWalkLine, true, '显示「正在遍历文件 0 / 118」')
  assert.equal(v.showBar, false, '不显示上一轮遗留的 100% 进度条')
})

test('进度条与文字同源：pct 恒等于 done / total', () => {
  for (const [done, total] of [[0, 10], [1, 3], [49, 118], [117, 118]]) {
    const v = scanProgressView(
      { walked: 118, total: 118 },
      { total, completed: done, queued: total - done },
      LIVE,
    )
    assert.equal(v.pct, Math.round((done / total) * 100), `${done}/${total}`)
  }
})

test('unsupported 计入已处理 → 队列排空时进度正好 100%', () => {
  // 无文本 / 纯图 PDF：不产生向量，但确实处理完了。修复前它不在字段里 → 卡在 97%。
  const v = scanProgressView(
    { walked: 3, total: 3 },
    { total: 3, queued: 0, vectorizing: 0, completed: 1, failed: 0, unsupported: 2 },
    LIVE,
  )
  assert.equal(v.done, 3)
  assert.equal(v.pct, 100, '有 unsupported 也要能到 100%')
})

test('vectorizing 算待处理 → 还有在飞的就不显示满进度', () => {
  const v = scanProgressView(
    { walked: 2, total: 2 },
    { total: 2, queued: 0, vectorizing: 1, completed: 1, failed: 0, unsupported: 0 },
    LIVE,
  )
  assert.equal(v.done, 1)
  assert.equal(v.pending, 1)
  assert.equal(v.done + v.pending, v.total, '已处理 + 待处理 = 总数（修复前差 1）')
  assert.ok(v.pct < 100, `还有在飞的不该满进度：${v.pct}`)
})

test('failed 计入已处理（失败也是处理完了，不能永远卡住进度）', () => {
  const v = scanProgressView(
    { walked: 2, total: 2 },
    { total: 2, queued: 0, vectorizing: 0, completed: 1, failed: 1, unsupported: 0 },
    LIVE,
  )
  assert.equal(v.pct, 100)
})

test('服务不可用 / 非扫描中：一律不显示进度', () => {
  for (const opts of [
    { scanning: true, serviceUp: false },
    { scanning: false, serviceUp: true },
    { scanning: false, serviceUp: null },
  ]) {
    const v = scanProgressView(REPORTED.scanPhase, REPORTED.vectorizePhase, opts)
    assert.equal(v.showBar, false, JSON.stringify(opts))
    assert.equal(v.showWalkLine, false, JSON.stringify(opts))
    assert.equal(v.showProcessedLine, false, JSON.stringify(opts))
  }
})

test('首次扫描（还没有任何计数）：什么都不显示，不报错', () => {
  const v = scanProgressView(undefined, undefined, LIVE)
  assert.equal(v.showBar, false)
  assert.equal(v.showWalkLine, false)
  assert.equal(v.showProcessedLine, false)
  assert.equal(v.pct, 0)
  const v2 = scanProgressView({ walked: 0, total: 0 }, { total: 0 }, LIVE)
  assert.equal(v2.walking, false, 'total 为 0 时不算遍历中')
  assert.equal(v2.showProcessedLine, false, 'total 为 0 不显示分母为 0 的进度')
})

test('pct 有上限 100（防御：计数异常也不画超长条）', () => {
  const v = scanProgressView(
    { walked: 1, total: 1 },
    { total: 1, completed: 5, unsupported: 5 },
    LIVE,
  )
  assert.equal(v.pct, 100)
})

test('老后端（无 total/vectorizing/unsupported 字段）退化为「不显示进度」，不误报', () => {
  // 兼容旧服务端：total 缺失 → 不显示「已处理」行（而不是显示 0/N 或算错）
  const v = scanProgressView(
    { walked: 118, total: 118 },
    { queued: 67, completed: 49, failed: 1 },
    LIVE,
  )
  assert.equal(v.total, 0)
  assert.equal(v.showProcessedLine, false, '缺基准时不显示进度，宁可不显示也不误导')
  assert.equal(v.showBar, false)
})

// ——— 2026-09-22：watcher 增量索引（后端 status 现在会报 scanning）———

test('★ 回归：增量索引期间不画「已处理 9 / 9」——那分母是上一轮全盘扫描的存量', () => {
  // 用户实测现场：拷目录进来，watcher 在算一个大 PDF（49 秒），
  // 库里还是全盘扫描完的旧账（9 个 completed），而 status 已是 scanning。
  // 照旧画进度会得到「已处理 9 / 9（待 0）」+「扫描中」——自相矛盾。
  const v = scanProgressView(
    { walked: 9, total: 9 },
    { total: 9, queued: 0, vectorizing: 0, completed: 8, failed: 0, unsupported: 1, inflight: 1 },
    LIVE,
  )
  assert.equal(v.showBar, false, '不画条：分母是存量，画出来会是 100% + 扫描中')
  assert.equal(v.showProcessedLine, false, '不报「已处理 9 / 9（待 0）」')
  assert.equal(v.done, 9, '计数本身仍照实给（已索引文件格用得上）')
})

test('增量索引结束（inflight 归零）后，进度行恢复显示', () => {
  const v = scanProgressView(
    { walked: 109, total: 109 },
    { total: 109, queued: 0, vectorizing: 0, completed: 108, failed: 0, unsupported: 1, inflight: 0 },
    LIVE,
  )
  assert.equal(v.showProcessedLine, true)
  assert.equal(v.pct, 100)
})

test('scanner 队列还有活时（pending>0）照常画进度——不因有在飞就全遮蔽', () => {
  // 全盘扫描的尾部：队列里还有 3 个、当前正在算第 4 个。此时 total 是**本轮**的
  // 分母（文件都已登记），进度可信，应当照常显示。
  const v = scanProgressView(
    { walked: 118, total: 118 },
    { total: 118, queued: 3, vectorizing: 1, completed: 113, failed: 0, unsupported: 1, inflight: 1 },
    LIVE,
  )
  assert.equal(v.showBar, true, 'pending>0 说明走的是 scanner 队列，分母可信')
  assert.equal(v.showProcessedLine, true)
})

test('老后端没有 inflight 字段：行为与改动前完全一致（不误遮蔽）', () => {
  const v = scanProgressView(
    { walked: 118, total: 118 },
    { total: 118, queued: 0, vectorizing: 0, completed: 117, failed: 0, unsupported: 1 },
    LIVE,
  )
  assert.equal(v.showBar, true)
  assert.equal(v.showProcessedLine, true)
})

// ——— 2026-09-23（池子化）：「待向量化」统计格改读后端权威值 ———
//
// 历史三修：
//   2026-09-21 改进度行时用了 queued+vectorizing，这格被漏掉 → 少 1；
//   2026-09-22 改成 queued+vectorizing+inflight（当时增量路径不写库，只能靠
//              进程内计数认出它）→ 引入**重复计数**：inflight 挂在两条路径
//              公共入口上，scanner 正在算的文件既有库行又被计入 inflight。
//   2026-09-23 池子化：后端直接给 `vectorizePhase.pending`（池中未算完的行数），
//              本格改读它。inflight 退化为纯「有没有活在干」的信号，不再相加。

test('★ 回归：直接采用后端给的 pending（不再自拼，杜绝重复计数）', () => {
  // 现场：库中 2 个排队 + 1 个在算 = 3；inflight 也是 1（就是那个在算的）。
  // 旧算法 2+1+1 = 4 —— 比真实值多 1，这就是「8 个文件的库算出 9」的同款错法。
  const v = scanProgressView(
    { walked: 118, total: 118 },
    { total: 118, queued: 2, vectorizing: 1, pending: 3, inflight: 1,
      completed: 115, failed: 0, unsupported: 0 },
    LIVE,
  )
  assert.equal(v.pendingTotal, 3, '以后端 pending 为准')
  assert.notEqual(v.pendingTotal, 4, '不得把 inflight 再加一次（那是同一个文件）')
  assert.equal(v.pendingTotal, v.pending, '统计格与进度行同源，不该有差值')
})

test('★ 回归：待向量化不得超过「知识库里一共几个文件」这个上限', () => {
  // 实测（隔离环境，8 个 md）：旧算法算出 pendingTotal = 9，而库中只有 8 行。
  // 这条件本身不可能成立 —— 用「≤ total」挡死这类回归。
  const total = 8
  const v = scanProgressView(
    { walked: 8, total: 8 },
    { total, queued: 5, vectorizing: 1, pending: 6, inflight: 1,
      completed: 2, failed: 0, unsupported: 0 },
    LIVE,
  )
  assert.equal(v.pendingTotal, 6)
  assert.ok(v.pendingTotal <= total, `待向量化 ${v.pendingTotal} 不应超过库里总行数 ${total}`)
})

test('无活时「待向量化」为 0（不虚报）', () => {
  const v = scanProgressView(
    { walked: 10, total: 10 },
    { total: 10, queued: 0, vectorizing: 0, pending: 0, inflight: 0,
      completed: 9, failed: 0, unsupported: 1 },
    LIVE,
  )
  assert.equal(v.pendingTotal, 0)
})

test('老后端（无 pending 字段）：「待向量化」退化为 queued + vectorizing', () => {
  // 兼容策略：宁可少算「尚未登记的在飞」那 1 个，也不重复计数。
  const v = scanProgressView(
    { walked: 10, total: 10 },
    { total: 10, queued: 4, vectorizing: 1, inflight: 2, completed: 5, failed: 0, unsupported: 0 },
    LIVE,
  )
  assert.equal(v.pendingTotal, 5, 'queued + vectorizing（不含 inflight）')
})

// ——— 2026-09-23：未纳入索引（排除规则 / 超出深度 / 不在知识库路径内）———

test('未纳入索引：从 scanPhase.excluded 透传出来（此前四个观测面全静默）', () => {
  const v = scanProgressView(
    { walked: 14, total: 14, errors: 2, excluded: 7 },
    { total: 9, queued: 0, vectorizing: 0, pending: 0, completed: 8, failed: 0, unsupported: 1 },
    LIVE,
  )
  assert.equal(v.excluded, 7)
})

test('未纳入索引：老后端没有该字段时为 0（不显示假数字）', () => {
  const v = scanProgressView(
    { walked: 14, total: 14 },
    { total: 9, queued: 0, vectorizing: 0, completed: 8, failed: 0, unsupported: 1 },
    LIVE,
  )
  assert.equal(v.excluded, 0)
})

// ——— 2026-09-23 第二版：后端新增 notIndexedPhase（数 + 明细同源）———

test('★ 未纳入索引：有 notIndexedPhase 时以后端权威值为准（不再前端自拼）', () => {
  // 后端把「遍历侧 excluded」与「库侧 unsupported」合并后给出 total；
  // 前端此前要自己把两处相加，正是「格上的数」与「展开明细」可能不同源的来源。
  const total = notIndexedTotalOf(
    { walked: 14, total: 14, excluded: 2 },
    { total: 9, queued: 0, vectorizing: 0, completed: 8, failed: 0, unsupported: 3 },
    { total: 5, details: [], detailsTruncated: false, byKind: { rule: 2, type: 3 } },
  )
  assert.equal(total, 5, '读后端 total，而不是 excluded + unsupported')
})

test('★ 老后端（无 notIndexedPhase）退回两处相加，行为与改动前一致', () => {
  const total = notIndexedTotalOf(
    { walked: 14, total: 14, excluded: 2 },
    { total: 9, queued: 0, vectorizing: 0, completed: 8, failed: 0, unsupported: 3 },
    undefined,
  )
  assert.equal(total, 5)
})

test('未纳入索引：后端字段缺失/为空时不虚报', () => {
  assert.equal(notIndexedTotalOf(undefined, undefined, undefined), 0)
  assert.equal(notIndexedTotalOf({ walked: 0, total: 0 }, { total: 0, queued: 0, vectorizing: 0, completed: 0, failed: 0 }, {}), 0)
})

