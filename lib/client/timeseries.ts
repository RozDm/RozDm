// One shared /api/timeseries request per range, kept for that range's server TTL (switching tabs back is free).
// Every /api/* call is a Worker invocation even on an edge-cache hit (run_worker_first; free plan 100k/day), so
// a tab the visitor already looked at isn't re-fetched until the answer would be stale anyway. A failed request
// is forgotten so the next call (switching range again) retries. Same idea as fetchGeoCountries (geo.ts).
import type { SeriesRangeKey, TimeseriesResponse } from '@/worker/api-types'
import { noteServerDate } from './server-clock'

// The Worker's edge-cache TTLs per range (worker/domain/timeseries.ts RANGES
// `ttlSeconds`: 60 / 300 / 600 / 900 s); mirrored here, nothing runtime may
// be imported from worker/. Keep them in step.
const TTL_MS: Record<SeriesRangeKey, number> = {
  '24h': 60_000,
  '7d': 300_000,
  '30d': 600_000,
  all: 900_000,
}

const cache = new Map<SeriesRangeKey, { at: number; promise: Promise<TimeseriesResponse> }>()

export function fetchSeries(range: SeriesRangeKey): Promise<TimeseriesResponse> {
  const now = Date.now()
  const hit = cache.get(range)
  if (hit && now - hit.at < TTL_MS[range]) return hit.promise
  const promise = fetch(`/api/timeseries?metric=geo&range=${range}`, { cache: 'no-store' }).then((r) => {
    // The chart's grid is laid out back from the server's "now".
    noteServerDate(r)
    return r.ok ? (r.json() as Promise<TimeseriesResponse>) : Promise.reject(new Error('http ' + r.status))
  })
  promise.catch(() => {
    if (cache.get(range)?.promise === promise) cache.delete(range)
  })
  cache.set(range, { at: now, promise })
  return promise
}
