// Docs drift check and module map: docs name real paths, source files state their purpose.
// (1) The agent docs (CLAUDE.md files, README, skills) name
// only paths that exist. (2) They mention every /api/* route, workflow, skill
// and hook. (3) Every Worker module (src/), lib/ file, scripts/ file and
// app/ page or route file opens with a one-line purpose comment, so the module
// inventory lives in the code, not in prose. Run by tests/docs.test.ts (so
// `npm test`, CI and deploy enforce it) and by the Stop hook
// (.claude/hooks/stop-docs.mjs) before a session ends.
//   node scripts/check-docs.mjs        prints the problems (exit 1 on any)
//   node scripts/check-docs.mjs --map  prints the module map: path — purpose
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

// Backticked tokens that look like paths but aren't repo files: packages,
// git refs, GitHub actions, URLs the build or Worker serves.
const NOT_PATHS = new Set(['cloudflare/wrangler-action', 'origin/main', 'favicon.ico'])
const NOT_PATH_PREFIXES = ['next/', '@', 'node:', 'eslint-config-']
// Build output and installs — named in docs, absent in a fresh checkout.
const UNTRACKED_OK = ['out', '.next', 'node_modules', '.wrangler']
const FILE_EXT = /\.(tsx?|mjs|js|jsonc?|md|sh|ya?ml|sql|css|svg|woff2|xml|txt|png|ico)$/

// Source files that must open with a purpose line: the Worker, lib/, scripts/,
// and each app/ route (its page.tsx or route.ts).
const HEADER_SCOPE = [/^(src|lib|scripts)\/(?!.*\.md$).+/, /^app\/(.+\/)?(page\.tsx|route\.tsx?)$/]
// `//` comments that are tool directives, not a purpose.
const DIRECTIVE = /^(@ts-|eslint|prettier|istanbul|c8 |vitest)/

// The one-line purpose a source file opens with: its first line after a
// shebang, blank lines and 'use client' / 'use server'. null when it has none.
export function purposeOf(source, file = '') {
  const marker = /\.sh$/.test(file) ? '#' : '//'
  const lines = source.split('\n')
  let i = lines[0]?.startsWith('#!') ? 1 : 0
  while (i < lines.length && /^\s*($|(['"])use (client|server)\2;?\s*$)/.test(lines[i])) i++
  const line = (lines[i] ?? '').trimEnd()
  if (!line.startsWith(marker) || line.startsWith(marker + marker.slice(-1))) return null
  const text = line.slice(marker.length).trim()
  return text.length >= 8 && !DIRECTIVE.test(text) ? text : null
}

function headerFiles(files) {
  return files.filter((f) => HEADER_SCOPE.some((re) => re.test(f))).sort()
}

// The module map: every file in scope with its purpose line.
export function moduleMap(root = ROOT) {
  return headerFiles(listFiles(root)).map((file) => ({
    file,
    purpose: purposeOf(fs.readFileSync(path.join(root, file), 'utf8'), file),
  }))
}

function listFiles(root) {
  const out = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard'], {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
  })
  return out.split('\n').filter((f) => f && fs.existsSync(path.join(root, f)))
}

// `a/{b,c}.ts` → `a/b.ts`, `a/c.ts` (one level is all the docs use).
function expandBraces(token) {
  const m = token.match(/^(.*?)\{([^{}]+)\}(.*)$/)
  return m ? m[2].split(',').map((part) => `${m[1]}${part}${m[3]}`) : [token]
}

function pathTokens(text) {
  const prose = text.replace(/^```[\s\S]*?^```/gm, '')
  const tokens = []
  for (const [, raw] of prose.matchAll(/`([^`\n]+)`/g)) {
    const t = raw.trim()
    if (/^(https?:|\/)/.test(t) || /[\s<>*…$=(:,]/.test(t.replace(/\{[^{}]*\}/g, ''))) continue
    if (NOT_PATHS.has(t) || NOT_PATH_PREFIXES.some((p) => t.startsWith(p)) || /^\.\w+$/.test(t)) continue
    if (!t.includes('/') && !FILE_EXT.test(t)) continue
    tokens.push(...expandBraces(t))
  }
  return tokens
}

export function checkDocs(root = ROOT) {
  const files = listFiles(root)
  const fileSet = new Set(files)
  const dirSet = new Set()
  for (const f of files) {
    for (let d = path.posix.dirname(f); d !== '.'; d = path.posix.dirname(d)) dirSet.add(d)
  }
  const all = [...fileSet, ...dirSet]
  const names = new Set(all.map((p) => path.posix.basename(p)))
  const exists = (p) => fileSet.has(p) || dirSet.has(p)

  const read = (f) => (fileSet.has(f) ? fs.readFileSync(path.join(root, f), 'utf8') : '')
  const skills = files.filter((f) => /^\.claude\/skills\/[^/]+\/SKILL\.md$/.test(f))
  const docs = [
    'CLAUDE.md',
    'app/CLAUDE.md',
    'components/CLAUDE.md',
    'src/CLAUDE.md',
    '.github/CLAUDE.md',
    'content/CLAUDE.md',
    'README.md',
    'ARCHITECTURE.md',
    'docs/gotchas.md',
    'docs/decisions.md',
    ...skills,
  ]
  const text = Object.fromEntries(docs.map((d) => [d, read(d)]))
  const anyDoc = (needle, among = docs) => among.some((d) => text[d].includes(needle))

  const problems = []

  // 1. Every path a doc names exists.
  for (const doc of docs) {
    for (const token of pathTokens(text[doc])) {
      const p = token.replace(/^\.\//, '').replace(/\/$/, '')
      const ok =
        exists(p) ||
        exists(path.posix.join(path.posix.dirname(doc), p)) ||
        UNTRACKED_OK.includes(p.split('/')[0]) ||
        (p.includes('/') ? all.some((f) => f.endsWith(`/${p}`)) : names.has(p))
      if (!ok) problems.push(`${doc}: \`${token}\` does not exist`)
    }
  }

  // 2. The small, high-value set a session must find in the docs: API routes,
  // workflows, skills, hooks.
  const ls = (dir, re) =>
    files
      .filter((f) => path.posix.dirname(f) === dir && re.test(path.posix.basename(f)))
      .map((f) => path.posix.basename(f))
  const subdirs = (dir) => [...dirSet].filter((d) => path.posix.dirname(d) === dir).map((d) => path.posix.basename(d))
  const need = (cond, msg) => cond || problems.push(msg)

  // Every route serves /api/<file name>, but for the few outside /api/.
  const ROUTE_PATHS = { 'mta-sts': '/.well-known/mta-sts.txt' }
  for (const f of ls('src/routes', /\.ts$/)) {
    const stem = f.replace(/\.ts$/, '')
    const route = ROUTE_PATHS[stem] ?? `/api/${stem}`
    need(text['src/CLAUDE.md'].includes(route), `src/CLAUDE.md: route ${route} is not in the API surface`)
  }
  for (const f of ls('.github/workflows', /\.ya?ml$/)) {
    need(text['.github/CLAUDE.md'].includes(f), `.github/CLAUDE.md: workflow ${f} is not described`)
  }
  for (const d of subdirs('.claude/skills')) need(anyDoc(d), `skill ${d} is not mentioned in any doc`)
  for (const f of ls('.claude/hooks', /./)) need(anyDoc(f), `hook .claude/hooks/${f} is not mentioned in any doc`)

  // 3. Every source file in scope opens with a one-line purpose comment.
  for (const f of headerFiles(files)) {
    need(
      purposeOf(read(f), f),
      `${f}: no purpose header (open the file with a one-line ${f.endsWith('.sh') ? '`# …`' : '`// …`'} comment saying what it is for)`,
    )
  }

  return problems
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.includes('--map')) {
    for (const { file, purpose } of moduleMap()) console.log(`${file} — ${purpose ?? '(no purpose header)'}`)
    process.exit(0)
  }
  const problems = checkDocs()
  for (const p of problems) console.error(p)
  process.exit(problems.length ? 1 : 0)
}
