// CI guard: the UI dictionary ships in exactly one client chunk of out/ (docs/gotchas.md: turbopackChunking).
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { die, flags } from './cli.mjs'

flags([], 'node scripts/check-dict.mjs')

// A string only the UI dictionary (data/dictionary.ts) carries: the skip link's label.
const MARKER = 'Hopp til hovedinnhold'
const DIR = 'out/_next/static/chunks'

if (!existsSync(DIR)) die(`check-dict: no ${DIR} — run npm run build first`)
const chunks = readdirSync(DIR).filter((f) => f.endsWith('.js'))
const n = chunks.filter((f) => readFileSync(path.join(DIR, f), 'utf8').includes(MARKER)).length
if (n !== 1) die(`UI dictionary in ${n} chunks, want 1 (docs/gotchas.md: turbopackChunking)`)
