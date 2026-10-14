/**
 * FilesearchClient.resetSettings 契约单测：方法 / 路径 / 请求体 / 错误传播。
 *
 * 用全局 fetch 打桩，断言的是「插件真正发出的请求」，而不是实现细节——
 * 后端契约一旦漂移（路径改名、方法从 POST 变 PUT），这里会红。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'

import { FilesearchClient, FilesearchError } from '../src/filesearchClient.ts'

interface Captured {
  url: string
  method: string
  body: string | undefined
}

function stubFetch(payload: unknown, status = 200): Captured[] {
  const calls: Captured[] = []
  globalThis.fetch = (async (url: string, init: RequestInit = {}) => {
    calls.push({
      url: String(url),
      method: init.method ?? 'GET',
      body: init.body === undefined ? undefined : String(init.body),
    })
    return {
      ok: status >= 200 && status < 300,
      status,
      statusText: 'OK',
      json: async () => payload,
    } as unknown as Response
  }) as typeof fetch
  return calls
}

const DEFAULTS = {
  index_dirs: ['/home/u/Desktop', '/home/u/Documents'],
  auto_index: true,
  indexable_types: ['md', 'txt'],
  exclude_patterns: ['.git'],
  max_depth: 3,
  top_k: 20,
}

test('resetSettings 发 POST /api/settings/reset，不带业务参数', async () => {
  const calls = stubFetch({ code: 0, message: 'success', data: DEFAULTS })
  const client = new FilesearchClient('http://127.0.0.1:18700')

  const data = await client.resetSettings()

  assert.equal(calls.length, 1)
  assert.equal(calls[0].method, 'POST')
  assert.equal(calls[0].url, 'http://127.0.0.1:18700/api/settings/reset')
  assert.equal(calls[0].body, '{}', '请求体为空对象即可（端点不读 payload）')
  assert.deepEqual(data, DEFAULTS, '返回恢复后的完整生效设置')
})

test('resetSettings 沿用 baseUrl（per-user 端口派生）', async () => {
  const calls = stubFetch({ code: 0, message: 'success', data: DEFAULTS })
  const client = new FilesearchClient('http://127.0.0.1:18703')
  await client.resetSettings()
  assert.equal(calls[0].url, 'http://127.0.0.1:18703/api/settings/reset')
})

test('后端 code≠0 → 抛 FilesearchError 并带上服务端 message', async () => {
  stubFetch({ code: 1, message: '配置写入失败', data: null })
  const client = new FilesearchClient('http://127.0.0.1:18700')
  await assert.rejects(
    () => client.resetSettings(),
    (e: unknown) => {
      assert.ok(e instanceof FilesearchError)
      assert.equal(e.code, 1)
      assert.equal(e.message, '配置写入失败')
      return true
    },
  )
})

test('HTTP 非 2xx → 抛 FilesearchError（code=-1）', async () => {
  stubFetch({}, 500)
  const client = new FilesearchClient('http://127.0.0.1:18700')
  await assert.rejects(() => client.resetSettings(), (e: unknown) => {
    assert.ok(e instanceof FilesearchError)
    assert.equal(e.code, -1)
    return true
  })
})
