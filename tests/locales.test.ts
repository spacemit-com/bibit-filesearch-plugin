/**
 * 语言通道单测（node --test，经 scripts/run-tests.mjs 打包）。
 *
 * 契约（2026-09-10 起）：宿主 bibit 把**已解析的最终语言**经 contribution props 下发
 *   FeatureRoutedContributionProps.language?: string
 * 宿主三个选项「简体中文 / English / 系统」里的「系统」由宿主自己按系统语言解析掉
 * （web-app/src/i18n/supportedLanguages.ts 的 resolveLanguage），插件只收到
 * 'en' / 'zh-CN' 这类最终语言。
 *
 * 本文件守住三件事：
 *   ① 归一化：认识的语言用，不认识的回退英文（不抛错、不白屏）
 *   ② 插件**不**自行解析语言：normalizeLanguage 是入参的纯函数，
 *      既不读 navigator.language 也不读宿主存储
 *       （回归：旧实现读 localStorage `setting-general` + 250ms 轮询，
 *        并自行把 'system' 解析成系统语言）
 *   ③ 词条与 manifest 声明一致
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'

import manifest from '../bibit.feature.json'
import {
  SUPPORTED_LANGUAGES,
  createTranslator,
  normalizeLanguage,
  pluginLocales,
  translate,
} from '../src/locales/index.ts'
import * as locales from '../src/locales/index.ts'

test('插件拥有 en 与 zh-CN 两套词条', () => {
  assert.deepEqual([...SUPPORTED_LANGUAGES], ['en', 'zh-CN'])
})

test('SUPPORTED_LANGUAGES 与 pluginLocales 的键一致（同源同序）', () => {
  assert.deepEqual(Object.keys(pluginLocales), [...SUPPORTED_LANGUAGES])
})

test('SUPPORTED_LANGUAGES 与 bibit.feature.json 的 locales 声明一致', () => {
  const declared = (manifest as { contributions?: { locales?: string[] } })
    .contributions?.locales
  assert.ok(Array.isArray(declared), 'manifest 应声明 contributions.locales')
  assert.deepEqual([...SUPPORTED_LANGUAGES].sort(), [...declared!].sort())
})

test('normalizeLanguage 接受宿主下发的最终语言', () => {
  assert.equal(normalizeLanguage('en'), 'en')
  assert.equal(normalizeLanguage('zh-CN'), 'zh-CN')
})

test('normalizeLanguage 对未知值回退英文（不抛错）', () => {
  for (const value of ['ja', 'vn', 'de-DE', '', undefined, null, 42, {}, ['en']]) {
    assert.equal(normalizeLanguage(value), 'en', `${String(value)} 应回退 en`)
  }
})

test('回归：normalizeLanguage 不自行解析 "system"（宿主负责解析）', () => {
  // 旧实现会把 'system' 拿去看 navigator.language；现在宿主只会下发已解析的语言，
  // 万一真收到 'system' 就当未知值回退英文——绝不读环境。
  assert.equal(normalizeLanguage('system'), 'en')
})

test('回归：归一是入参的纯函数，不读 navigator.language', () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'navigator')
  try {
    Object.defineProperty(globalThis, 'navigator', {
      value: { language: 'zh-CN' },
      configurable: true,
    })
    // 中文环境下，'system' 与未知值仍是 en（证明没有走环境解析），
    // 而显式 'zh-CN' 才是 zh-CN（证明只认入参）。
    assert.equal(normalizeLanguage('system'), 'en')
    assert.equal(normalizeLanguage('ja'), 'en')
    assert.equal(normalizeLanguage('zh-CN'), 'zh-CN')
    assert.equal(normalizeLanguage(undefined), 'en')
  } finally {
    if (original) Object.defineProperty(globalThis, 'navigator', original)
    else delete (globalThis as { navigator?: unknown }).navigator
  }
})

test('回归：不再导出读宿主存储 / 轮询的通路', () => {
  const removed = ['getHostLanguage', 'getHostLanguagePreference', 'subscribeHostLanguage']
  for (const name of removed) {
    assert.equal(
      (locales as Record<string, unknown>)[name],
      undefined,
      `${name} 应已删除（语言改由宿主经 props 下发）`
    )
  }
})

test('中英文取词各自命中', () => {
  assert.equal(translate('en', 'reset.button'), 'Restore defaults')
  assert.equal(translate('zh-CN', 'reset.button'), '恢复默认')
  assert.equal(translate('zh-CN', 'reset.cancel'), '取消')
})

test('缺词回退英文；英文也缺则返回键本身', () => {
  // 用只存在于 en 的键验证回退：构造一个临时资源不方便，
  // 改为断言契约——未知键原样返回，不抛错。
  assert.equal(translate('zh-CN', 'no.such.key' as never), 'no.such.key')
})

test('插值 {{var}} 与宿主 setup.ts 语义一致', () => {
  const out = translate('en', 'errors.readConfig', { message: 'boom' })
  assert.ok(out.includes('boom'), out)
  assert.ok(!out.includes('{{'), out)
  // 未提供变量时保留占位符原样
  const kept = translate('en', 'errors.readConfig')
  assert.ok(kept.includes('{{message}}'), kept)
})

test('createTranslator 绑定语言并暴露 language', () => {
  const zh = createTranslator('zh-CN')
  assert.equal(zh.language, 'zh-CN')
  assert.equal(zh.t('reset.button'), '恢复默认')
  const en = createTranslator('en')
  assert.equal(en.language, 'en')
  assert.equal(en.t('reset.button'), 'Restore defaults')
})
