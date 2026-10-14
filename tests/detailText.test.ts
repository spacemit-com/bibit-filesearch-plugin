/**
 * 明细文案的回归测试（2026-09-23 用户报「英文界面里失败提示还是中文」）。
 *
 * 守三件事：
 *   ① 后端给结构化标记时，界面按**当前语言**出词 —— 英文 locale 下不得出现中文
 *      （这正是用户看到的现象：后端塞了中文句子，前端原样打印）
 *   ② 非结构化原因（embed 过载、解析异常…）保持原文，不被吞掉也不被乱翻
 *   ③ 标记在但 JSON 损坏时退化为「显示原文」，不能把整行搞崩
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  OCR_FAILED_PREFIX,
  PARSE_FAILED_PREFIX,
  REASON_MARKER_PREFIX,
  failureKindLabel,
  failureReasonFullText,
  failureReasonText,
  notIndexedKindLabel,
  notIndexedReasonText,
  notIndexedSummaryText,
  parseStructuredFailure,
  parseUnencodableReason,
} from '../src/detailText.ts'
import { createTranslator, normalizeLanguage } from '../src/locales/index.ts'

const zh = createTranslator(normalizeLanguage('zh-CN')).t
const en = createTranslator(normalizeLanguage('en')).t

const MARKER =
  REASON_MARKER_PREFIX +
  JSON.stringify({
    kind: 'unencodableFilename',
    encoding: 'gb18030',
    guess: '/kb/深度拷问清单.md',
    base: "b'\\xc9\\xee.md'",
  })

/**
 * 判断「文案本身是英文」的正确姿势：**扣掉插值数据后再查中文**。
 *
 * 为什么不能直接查整串：`guess` 是后端按 gb18030 读出来的**文件名**，它本身就是中文
 * （那是数据，不是界面文案）。第一版用例直接在整串上查中文 → 误报。所以这里把插值
 * 内容先剔除，只审模板语言。
 */
const wordingOnly = (s: string, ...data: string[]): string =>
  data.reduce((acc, d) => (d ? acc.split(d).join('<data>') : acc), s)

test('结构化原因：中文界面出中文、英文界面出英文（不再漏中文）', () => {
  const guess = '/kb/深度拷问清单.md'
  const z = failureReasonText(MARKER, zh)
  const e = failureReasonText(MARKER, en)
  assert.ok(z.includes(guess) && z.includes('gb18030'), z)
  assert.ok(e.includes(guess) && e.includes('gb18030'), e)
  // 英文模板里除插值数据外不得有中文（首版用例漏了扣除数据，误报过）
  const wording = wordingOnly(e, guess, 'gb18030')
  assert.ok(!/[\u4e00-\u9fff]/.test(wording), `英文文案模板不得含中文，实际: ${wording}`)
  assert.ok(/UTF-8/.test(e) && /rename/i.test(e), e)
  // 反向对照：中文模板确实是中文（否则上面那条断言可能因为两边都英文而假通过）
  assert.ok(/[\u4e00-\u9fff]/.test(wordingOnly(z, guess, 'gb18030')), z)
})

test('结构化原因：界面文案不带原始字节 repr', () => {
  // 2026-09-23 用户定案：删掉原因列的悬停提示（原 title 会弹「…。原始字节：b'…'」）。
  // 这条守的是「凡是渲染进界面的文案，都不含字节 repr」——包括那条已删除的完整版。
  const short = failureReasonText(MARKER, en)
  assert.ok(!short.includes('\\xc9'), '界面文案不该把字节 repr 塞进去（用户嫌累赘）')
  assert.ok(!/[\\]x[0-9a-f]{2}/.test(short), short)
  // 完整版函数仍存在（后端调试/将来复用），但它的产物只用于非界面场景；
  // 界面已不再引用它 —— 见 FilesearchPage.tsx 里 fs-failed-reason 已无 title。
})

test('结构化原因：分类标签走专用标签（「文件名」而非「解析」）', () => {
  assert.equal(failureKindLabel('parse', MARKER, zh), zh('failedFiles.kindFilename'))
  assert.equal(failureKindLabel('parse', MARKER, en), en('failedFiles.kindFilename'))
  assert.ok(!/[\u4e00-\u9fff]/.test(failureKindLabel('parse', MARKER, en)))
  // 普通原因仍按 kind 映射
  assert.equal(failureKindLabel('embed', 'boom', en), en('failedFiles.kindEmbed'))
  assert.equal(failureKindLabel(undefined, 'boom', zh), zh('failedFiles.kindOther'))
})

test('非结构化原因：原样透传（服务侧技术细节，翻译反而丢信息）', () => {
  assert.equal(failureReasonText('embed 请求失败（重试 3 次）: timeout', zh), 'embed 请求失败（重试 3 次）: timeout')
  assert.equal(failureReasonText('boom', en), 'boom')
  assert.equal(failureReasonText(undefined, en), '')
  assert.equal(failureReasonFullText('boom', en), 'boom')
  // 界面不再调用 failureReasonFullText；此处仅确认它仍可被调用（供非界面场景）
})

test('标记在但 JSON 损坏：退化为显示原文，不崩、不吞', () => {
  const broken = REASON_MARKER_PREFIX + '{not json'
  assert.equal(parseUnencodableReason(broken), null)
  assert.equal(failureReasonText(broken, en), broken)
  assert.equal(failureKindLabel('parse', broken, en), en('failedFiles.kindParse'))
})

test('未纳入索引：四种分类的标签都按语言给', () => {
  assert.equal(notIndexedKindLabel({ kind: 'rule' }, en), en('notIndexedFiles.kindRule'))
  assert.equal(notIndexedKindLabel({ kind: 'depth' }, en), en('notIndexedFiles.kindDepth'))
  assert.equal(
    notIndexedKindLabel({ reason: 'type', fileType: 'ipynb' }, en),
    en('notIndexedFiles.kindTypeWithExt', { ext: 'ipynb' }),
  )
  assert.equal(notIndexedKindLabel({ reason: 'type' }, zh), zh('notIndexedFiles.kindType'))
  assert.equal(notIndexedKindLabel({ reason: 'noText' }, en), en('notIndexedFiles.kindNoText'))
  assert.equal(notIndexedKindLabel({}, en), en('notIndexedFiles.kindOther'))
  for (const d of [{ kind: 'rule' }, { kind: 'depth' }, { reason: 'type' }, { reason: 'noText' }, {}]) {
    assert.ok(!/[\u4e00-\u9fff]/.test(notIndexedKindLabel(d, en)), `英文下不该有中文: ${JSON.stringify(d)}`)
  }
})

test('未纳入索引：每行也有说明句，英文界面不得出现中文', () => {
  const cases = [
    { kind: 'rule' },
    { kind: 'depth' },
    { reason: 'type', fileType: 'other' },
    { reason: 'noText' },
    {},
  ]
  for (const d of cases) {
    const z = notIndexedReasonText(d, zh)
    const e = notIndexedReasonText(d, en)
    assert.ok(z.length > 0, `中文说明为空: ${JSON.stringify(d)}`)
    assert.ok(e.length > 0, `英文说明为空: ${JSON.stringify(d)}`)
    assert.ok(!/[\u4e00-\u9fff]/.test(e), `英文下不该有中文: ${e}`)
  }
})

test('未纳入索引：每行两列（文件名 + 原因），与失败面板同构', () => {
  // 2026-09-23 用户定案：去掉左侧徽标列 —— 界面每行只剩「文件名 + 原因」。
  // 这条守的是「原因句必须存在且按语言出词」（少了它行内就只剩路径，与失败面板不同构）。
  const d = { kind: 'rule' as const }
  assert.equal(notIndexedReasonText(d, en), en('notIndexedFiles.reasonRule'))
  assert.ok(!/[\u4e00-\u9fff]/.test(notIndexedReasonText(d, en)))
})

test('未纳入索引：原因汇总按分组拼接，零值分组不出现', () => {
  const e = notIndexedSummaryText({ rule: 5, type: 2, depth: 0 }, 7, en)
  assert.ok(e.includes('7'), e)
  assert.ok(e.includes(en('notIndexedFiles.kindRule')) && e.includes('5'), e)
  assert.ok(e.includes('2'), e)
  assert.ok(!e.includes(en('notIndexedFiles.kindDepth')), `零值分组不该出现: ${e}`)
  assert.ok(!/[\u4e00-\u9fff]/.test(e), e)
  // 空/缺失 byKind：给占位符，不产出 "共 0 个（）" 这种残句
  const empty = notIndexedSummaryText(undefined, 3, en)
  assert.ok(empty.includes('3') && !empty.includes('undefined'), empty)
})

/* ── 2026-09-28（0.1.24~test3）：解析 / OCR 失败也要按语言出词 ─────────────
 *
 * 现场（真机实测）：界面选中文，「失败文件」明细右侧却是
 *   `Failed to open file '/…/mm02-fake.pdf' as type pdf.`
 * 根因：后端把库的原始英文报错直接当句子输出，前端只能照打。
 * 修法：后端改给结构化标记（parseFailed: / ocrFailed:），前端拼「中文壳 + 原文」。
 * 本组测试正是这次现象的回归网：
 *   ① 中文界面下，那一行**必须以中文开头**（不得直接以英文报错打头）
 *   ② 英文界面下不得出现中文
 *   ③ 原文细节不能被吞掉（排障要用）
 *   ④ 标记坏掉时回退显示原文，不能崩
 */

const PARSE_MARKER =
  PARSE_FAILED_PREFIX +
  JSON.stringify({
    kind: 'parseFailed',
    errorType: 'FileDataError',
    detail: "Failed to open file '/kb/mm02-fake.pdf' as type pdf.",
  })

test('解析失败：中文界面出中文壳，且原文细节保留', () => {
  const out = failureReasonText(PARSE_MARKER, zh)
  // ① 中文打头 —— 这正是「界面选中文却看到英文」的反面
  assert.ok(/^解析失败/.test(out), `中文界面应以中文开头: ${out}`)
  // ③ 细节不丢（路径 + 库的原始报错都要能查到）
  assert.ok(out.includes('mm02-fake.pdf'), `原文细节不该丢: ${out}`)
  assert.ok(out.includes('as type pdf'), `原始报错不该丢: ${out}`)
})

test('解析失败：英文界面不出中文，也没有插值残渣', () => {
  const out = failureReasonText(PARSE_MARKER, en)
  assert.ok(!/[\u4e00-\u9fff]/.test(out), `英文界面不该有中文: ${out}`)
  assert.ok(out.includes('mm02-fake.pdf'), out)
  assert.ok(!out.includes('{{'), `不该漏出未替换的插值: ${out}`)
})

test('OCR 失败：走同一条通道，文案与解析失败区分开', () => {
  const marker =
    OCR_FAILED_PREFIX +
    JSON.stringify({ kind: 'ocrFailed', errorType: 'RuntimeError', detail: 'engine exploded' })
  const z = failureReasonText(marker, zh)
  const e = failureReasonText(marker, en)
  assert.ok(/^文字识别失败/.test(z), `中文壳: ${z}`)
  assert.ok(z.includes('engine exploded'), z)
  assert.ok(!/[\u4e00-\u9fff]/.test(e), e)
  // 与解析失败的文案不同（别把两类混成一句）
  assert.notEqual(z, failureReasonText(PARSE_MARKER, zh))
})

test('结构化标记：坏 JSON / 缺前缀 → 回退显示原文，不崩不吞', () => {
  assert.equal(parseStructuredFailure(PARSE_FAILED_PREFIX + '{not json'), null)
  const broken = PARSE_FAILED_PREFIX + '{not json'
  assert.equal(failureReasonText(broken, en), broken)
  assert.equal(parseStructuredFailure('embed:{...}'), null, 'embed 前缀不该被当成解析失败')
  assert.equal(parseStructuredFailure(undefined), null)
  // detail 缺失时退回 errorType，不留空壳
  const noDetail = PARSE_FAILED_PREFIX + JSON.stringify({ kind: 'parseFailed', errorType: 'X' })
  assert.ok(failureReasonText(noDetail, zh).includes('X'), failureReasonText(noDetail, zh))
})

test('状态胶囊：有失败时不再显示「N 个失败」（用户 2026-09-28 定案）', () => {
  // 这条守的是 locales 本身 —— 胶囊文案里不得再带计数插值。
  assert.equal(zh('pill.doneWithFailures'), zh('pill.done'))
  assert.equal(en('pill.doneWithFailures'), en('pill.done'))
  assert.ok(!zh('pill.doneWithFailures').includes('失败'), zh('pill.doneWithFailures'))
})
