// Prints lib/site.ts's origin constants as shell assignments, so scripts/smoke.sh names no host of its own.
import { SITE_HOST, SITE_URL } from '../lib/site.ts'
import { flags } from './cli.mjs'

flags([], 'node scripts/site-env.mjs')

// Single-quoted for `eval`: a quote inside a value closes, escapes and reopens.
const sh = (v) => `'${String(v).replaceAll("'", `'\\''`)}'`
console.log(`SITE_URL=${sh(SITE_URL)}\nSITE_HOST=${sh(SITE_HOST)}`)
