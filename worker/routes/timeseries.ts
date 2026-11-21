// GET /api/timeseries?metric=view|geo|mailfail&range=24h|7d|30d|all — a bucketed AE series for the Trends card.
// No range is 7d; an unknown one is a 400, like an unknown metric.
// The series comes from domain/timeseries-store.ts. When AE doesn't answer
// (secrets unset, AE down) the answer is an empty series flagged `degraded`,
// so the UI degrades gracefully instead of erroring.
import type { TimeseriesErrorCode, TimeseriesResponse } from '../api-types'
import { apiError, cachedApiJson, putCachedApiJson, refuseMethod } from '../http'
import { parseMetric, parseRange } from '../domain/timeseries'
import { querySeries } from '../domain/timeseries-store'

// This route refuses only with its own codes (TimeseriesErrorCode); tsc holds it to that.
const refuse: (code: TimeseriesErrorCode) => Response = apiError

// Must stay below the 30 s between the watchdog's three tries
// (status-watchdog.yml), so each try asks AE again.
const DEGRADED_TTL_S = 20

export async function handleTimeseries(
  url: URL,
  request: Request,
  env: Env,
  ctx: ExecutionContext,
): Promise<Response | null> {
  if (url.pathname !== '/api/timeseries') return null
  const refused = refuseMethod(request, ['GET'])
  if (refused) return refused

  const metric = parseMetric(url.searchParams.get('metric'))
  if (!metric) return refuse('bad_metric')
  const parsed = parseRange(url.searchParams.get('range'))
  if (!parsed) return refuse('bad_range')
  const { key: rangeKey, range } = parsed

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
