/**
 * 插件单测运行器：esbuild 打包 tests/*.test.ts → 临时 .mjs → node --test。
 *
 * 为什么不用 `node --test --experimental-strip-types`：本机 Node v22.22.1 未编译
 * TS 支持（ERR_NO_TYPESCRIPT），且仓库已有 esbuild（vite 依赖）可直接降级编译。
 * 依赖 `--packages=external` 保持 node: 内置模块为 external。
 */
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const testsDir = join(root, 'tests')
const outDir = mkdtempSync(join(tmpdir(), 'fs-plugin-tests-'))

const files = readdirSync(testsDir).filter((f) => f.endsWith('.test.ts'))
if (files.length === 0) {
  console.error('tests/ 下没有 *.test.ts')
  process.exit(1)
}

const built = []
for (const f of files) {
  const out = join(outDir, f.replace(/\.ts$/, '.mjs'))
  execFileSync(
    join(root, 'node_modules/.bin/esbuild'),
    [join(testsDir, f), '--bundle', '--format=esm', '--platform=node',
     '--packages=external', `--outfile=${out}`],
    { cwd: root, stdio: ['ignore', 'ignore', 'inherit'] },
  )
  built.push(out)
}

try {
  execFileSync(process.execPath, ['--test', ...built], { cwd: root, stdio: 'inherit' })
} finally {
  rmSync(outDir, { recursive: true, force: true })
}
