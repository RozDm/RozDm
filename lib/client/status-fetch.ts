// One shared /api/status request for the footer dot and the status dashboard.
// One /api/status request shared by the footer's StatusDot and the front
// page's StatusDashboard: each fetches as it nears the viewport, often in the
// same moment (a tall screen, a reader scrolling past both) — two Worker
// requests (free plan: 100k/day) for one answer otherwise.
// Calls within SHARE_MS get the same promise; the dashboard's polls (30 s
// apart at the least) always ask afresh. A failed request is forgotten so the
// next caller retries. Same idea as fetchGeoCountries (lib/client/geo.ts).
import type { StatusResponse } from '@/src/api-types'
import { noteServerDate } from './server-clock'

// What /api/status answers: the cron's snapshot, or `{results:[],history:[]}`
// (no updatedAt) when KV has none.
export type StatusSnapshot = StatusResponse

const SHARE_MS = 10_000
let shared: { at: number; promise: Promise<StatusSnapshot> } | null = null

export function fetchStatus(): Promise<StatusSnapshot> {
  const now = Date.now()
  if (shared && now - shared.at < SHARE_MS) return shared.promise
  const promise = fetch('/api/status', { cache: 'no-store' }).then((r) => {
    // Staleness is judged by the server's clock (lib/client/server-clock.ts).
    noteServerDate(r)
    return r.ok ? (r.json() as Promise<StatusSnapshot>) : Promise.reject(new Error('http ' + r.status))
  })
  promise.catch(() => {
    if (shared?.promise === promise) shared = null
  })
  shared = { at: now, promise }
  return promise
}
