// GET /api/timeseries?metric=view|geo|mailfail&range=24h|7d|30d|all — a bucketed AE series for the Trends card.
// The series comes from domain/timeseries-store.ts. When AE doesn't answer
// (secrets unset, AE down) the answer is an empty series flagged `degraded`,
// so the UI degrades gracefully instead of erroring.
import type { TimeseriesResponse } from '../api-types'
import { apiError, cachedApiJson, putCachedApiJson } from '../http'
import { parseMetric, parseRange } from '../domain/timeseries'
import { querySeries } from '../domain/timeseries-store'

// Must stay below the 30 s between the watchdog's three tries
// (status-watchdog.yml), so each try asks AE again.
const DEGRADED_TTL_S = 20

export async function handleTimeseries(url: URL, env: Env, ctx: ExecutionContext): Promise<Response | null> {
  if (url.pathname !== '/api/timeseries') return null

  const metric = parseMetric(url.searchParams.get('metric'))
  if (!metric) return apiError('bad_metric')
  const { key: rangeKey, range } = parseRange(url.searchParams.get('range'))

  // Canonical key from the validated metric+range only — the raw URL would
  // let junk query params fragment the cache and hit the AE API per request.
  const cache = await cachedApiJson(`${url.origin}${url.pathname}?metric=${metric}&range=${rangeKey}`)
  if (cache.hit) return cache.hit

  const points = await querySeries(env, metric, range)
  if (points) {
    return putCachedApiJson(
      ctx,
      cache.key,
      JSON.stringify({ metric, range: rangeKey, points } satisfies TimeseriesResponse),
      range.ttlSeconds,
    )
  }
  // Degraded answer (missing secrets or AE failure): cached for only
  // DEGRADED_TTL_S — bounds AE API calls while AE/the token is down without
  // pinning an empty chart. The chart reads it as empty; `degraded` is for
  // the watchdog (status-watchdog.yml) — an expired or revoked AE token
  // otherwise looks exactly like a quiet week.
  return putCachedApiJson(
    ctx,
    cache.key,
    JSON.stringify({ metric, range: rangeKey, points: [], degraded: true } satisfies TimeseriesResponse),
    DEGRADED_TTL_S,
  )
}
