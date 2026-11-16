// Time-series storage: the Analytics Engine SQL API query behind /api/timeseries.
// Worker-only (fetch with the AE secrets). SQL building and parsing are
// timeseries.ts. AE-side failures (non-2xx, parse, fetch) log to Worker
// observability via console.error so an unexpectedly empty chart is
// diagnosable from the dashboard.
import type { SeriesMetric, SeriesPoint } from '../api-types'
import { type SeriesRange, buildSeriesSql, parseSeriesResponse } from './timeseries'

const DATASET = 'rozsoshnykh_metrics'
const AE_TIMEOUT_MS = 8_000

// The series as AE answered it, or null when AE didn't answer: its secrets
// unset (a deploy without them), a non-2xx, an unparsable body, a timeout.
// Only a real answer may be edge-cached for the range's TTL: caching a
// transient failure used to pin an empty chart at the colo for the whole TTL.
export async function querySeries(env: Env, metric: SeriesMetric, range: SeriesRange): Promise<SeriesPoint[] | null> {
  if (!env.CF_ACCOUNT_ID || !env.AE_API_TOKEN) return null
  try {
    const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${env.CF_ACCOUNT_ID}/analytics_engine/sql`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.AE_API_TOKEN}`,
        'Content-Type': 'text/plain',
      },
      body: buildSeriesSql(DATASET, metric, range),
      // A slow AE answer degrades to an empty series instead of holding the
      // request (and its Worker CPU wall time) open.
      signal: AbortSignal.timeout(AE_TIMEOUT_MS),
    })
    const text = await res.text()
    if (!res.ok) {
      // Surface the failure in Worker observability logs so we don't have to
      // guess why the chart is empty (typical cause: token missing
      // Account.Analytics:Read, returns 403 with a JSON error envelope).
      console.error('timeseries: AE returned', res.status, text.slice(0, 200))
      return null
    }
    try {
      return parseSeriesResponse(JSON.parse(text))
    } catch (err) {
      console.error('timeseries: AE JSON parse failed', err, text.slice(0, 200))
      return null
    }
  } catch (err) {
    console.error('timeseries: AE fetch failed', err)
    return null
  }
}
