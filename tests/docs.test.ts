import { describe, it, expect } from 'vitest'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

// The agent docs are part of the build: a stale path, an undocumented API
// route, workflow, skill or hook, or a source file without a one-line purpose
// header fails `npm test` (and so CI and the deploy). The logic lives in
// scripts/check-docs.mjs, shared with the Stop hook.
describe('docs', () => {
  it('name only existing paths, cover every route, workflow, skill and hook, and every module has a purpose header', () => {
    let output = ''
    try {
      execFileSync(process.execPath, ['scripts/check-docs.mjs'], { encoding: 'utf8', stdio: 'pipe' })
    } catch (err) {
      output = String((err as { stderr?: string }).stderr || err)
    }
    expect(output).toBe('')
  })
})

// Each case runs a copy of the script in a throwaway git repo, so the repo it
// checks (its own location) is the fixture, not this one.
describe('check-docs purpose headers', () => {
  function run(files: Record<string, string>, ...args: string[]) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'check-docs-'))
    try {
      fs.mkdirSync(path.join(dir, 'scripts'))
      fs.copyFileSync('scripts/check-docs.mjs', path.join(dir, 'scripts/check-docs.mjs'))
      for (const [file, body] of Object.entries(files)) {
        fs.mkdirSync(path.dirname(path.join(dir, file)), { recursive: true })
        fs.writeFileSync(path.join(dir, file), body)
      }
      execFileSync('git', ['init', '-q'], { cwd: dir })
      const res = (() => {
        try {
          const stdout = execFileSync(process.execPath, ['scripts/check-docs.mjs', ...args], {
            cwd: dir,
            encoding: 'utf8',
            stdio: 'pipe',
          })
          return { code: 0, stdout, stderr: '' }
        } catch (err) {
          const e = err as { status?: number; stdout?: string; stderr?: string }
          return { code: e.status ?? 1, stdout: e.stdout ?? '', stderr: e.stderr ?? '' }
        }
      })()
      return res
    } finally {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  }

  const HEADED = '// Does the thing the module exists for.\nexport const x = 1\n'
  const files = {
    'scripts/ok.mjs': '#!/usr/bin/env node\n// Prints hello for the demo.\nconsole.log("hi")\n',
    'scripts/ok.sh': '#!/usr/bin/env bash\n# Checks that the demo site answers.\ntrue\n',
    'lib/client.ts': "'use client'\n\n// A client hook for the demo widget.\nexport const y = 1\n",
    'src/worker.ts': HEADED,
    'app/blogg/page.tsx': '// Blog index (Norwegian).\nexport default function P() { return null }\n',
  }

  it('passes when every file in scope opens with a purpose line (after a shebang or use client)', () => {
    const res = run(files)
    expect(res.stderr).toBe('')
    expect(res.code).toBe(0)
  })

  it.each([
    ['no comment at all', 'src/worker.ts', 'export const x = 1\n'],
    [
      'a comment after the imports',
      'lib/client.ts',
      "import fs from 'node:fs'\n// Too late to count.\nexport const y = 1\n",
    ],
    ['a tool directive instead of a purpose', 'scripts/ok.mjs', '// @ts-check\nconsole.log("hi")\n'],
    ['a page without one', 'app/blogg/page.tsx', 'export default function P() { return null }\n'],
  ])('fails on %s', (_name, file, body) => {
    const res = run({ ...files, [file]: body })
    expect(res.code).toBe(1)
    expect(res.stderr).toContain(`${file}: no purpose header`)
  })

  it('does not ask for headers outside src/, lib/, scripts/ and app routes', () => {
    const res = run({
      ...files,
      'components/Widget.tsx': 'export const w = 1\n',
      'app/layout.tsx': 'export const l = 1\n',
    })
    expect(res.code).toBe(0)
  })

  it('--map prints path — purpose for every file in scope, sorted', () => {
    const res = run(files, '--map')
    expect(res.code).toBe(0)
    // The copied script is itself in scope; its own line is not under test.
    const lines = res.stdout
      .trimEnd()
      .split('\n')
      .filter((l) => !l.startsWith('scripts/check-docs.mjs'))
    expect(lines).toEqual([
      'app/blogg/page.tsx — Blog index (Norwegian).',
      'lib/client.ts — A client hook for the demo widget.',
      'scripts/ok.mjs — Prints hello for the demo.',
      'scripts/ok.sh — Checks that the demo site answers.',
      'src/worker.ts — Does the thing the module exists for.',
    ])
  })

  it('--map marks a file without a header', () => {
    const res = run({ 'src/bare.ts': 'export const z = 1\n' }, '--map')
    expect(res.stdout).toContain('src/bare.ts — (no purpose header)')
  })
})
