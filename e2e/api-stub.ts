// The /api/* answers the browser tests run against — the Worker isn't running
// in e2e; e2e/fixtures.ts routes every /api/* request here. Each answer has
// the status and JSON shape of the real route handler's (worker/routes/), and
// tests/worker/api-stub.test.ts holds them to it: a handler change that
// alters an answer fails there until the stub follows. No Playwright import —
// Vitest loads this file too. Bodies `satisfies` the contract (worker/api-types.ts).
import type {
  ApiError,
  ApiErrorCode,
  ApiOk,
  GeoResponse,
  SeriesPoint,
  SeriesRangeKey,
  StatusResponse,
  TimeseriesError,
  TimeseriesResponse,
  ViewsResponse,
  VisitProbe,
} from '../worker/api-types'

export interface StubAnswer {
  status: number
  body: string
  headers?: Record<string, string>
}

const pad = (n: number) => String(n).padStart(2, '0')

// An AE bucket key ("YYYY-MM-DD HH:00:00", UTC) for the hour holding `ms`.
export const hourKey = (ms: number) => {
  const d = new Date(ms - (ms % 3_600_000))
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:00:00`
}

// Above MIN_PUBLIC_VISITS (lib/client/geo.ts), so the counts show; a test for the
// quiet state overrides /api/geo with fewer.
export const STUB_COUNTRIES: Record<string, number> = { NO: 120, US: 9, UA: 4 }
export const STUB_MONITORS = ['NetBox', 'Grafana']

// The dots a range's answer carries, on that range's own bucket grid: the chart
// (lib/shared/timeseries-fill.ts) merges by EXACT bucket key, and 30d/all use 6 h
// buckets. 24h/7d: hour keys 30, 5 and 2 h back; 30d/all: the 6 h buckets 5, 2
// and 0 back from the one holding `now`, so any time of day draws three dots.
export function stubPoints(range: SeriesRangeKey, now: number): SeriesPoint[] {
  if (range === '30d' || range === 'all') {
    const step = 6 * 3_600_000
    const end = Math.floor(now / step) * step
    return [5, 2, 0].map((back, i) => ({ ts: hourKey(end - back * step), value: i + 1 }))
  }
  return [30, 5, 2].map((h, i) => ({ ts: hourKey(now - h * 3_600_000), value: i + 1 }))
}

const RANGES: string[] = ['24h', '7d', '30d', 'all'] satisfies SeriesRangeKey[]

// The methods each route serves (worker/routes/*, refuseMethod): any other is
// a 405 with `Allow`; a path in none of them is the Worker's 404 `not_found`.
const METHODS: [RegExp, string[]][] = [
  [/^\/api\/(status|geo|timeseries)$/, ['GET']],
  [/^\/api\/(visit|views\/[^/]+)$/, ['GET', 'POST']],
  [/^\/api\/(contact|csp-report)$/, ['POST']],
]

export function apiStub(url: URL, method: string, now = Date.now()): StubAnswer {
  const path = url.pathname
  const json = (body: unknown, status = 200, headers?: Record<string, string>): StubAnswer => ({
    status,
    body: JSON.stringify(body),
    ...(headers && { headers }),
  })
  // The Worker's refusal shape (worker/http.ts apiError); the message is free text.
  const refuse = (code: ApiErrorCode, status: number, message: string, headers?: Record<string, string>) =>
    json({ error: { code, message } } satisfies ApiError, status, headers)

  const allowed = METHODS.find(([re]) => re.test(path))?.[1]
  if (!allowed) return refuse('not_found', 404, 'No such endpoint.')
  if (!allowed.includes(method))
    return refuse('method_not_allowed', 405, 'Method not allowed.', { Allow: allowed.join(', ') })

  if (path === '/api/status') {
    const up = Object.fromEntries(STUB_MONITORS.map((name) => [name, true]))
    return json({
      updatedAt: new Date(now - 60_000).toISOString(),
      results: STUB_MONITORS.map((name, i) => ({ name, ok: true, status: 200, ms: 120 + 20 * i })),
      history: [2, 1, 0].map((i) => ({ at: new Date(now - i * 300_000).toISOString(), up })),
    } satisfies StatusResponse)
  }
  if (path === '/api/geo') return json({ countries: STUB_COUNTRIES } satisfies GeoResponse)
  if (path === '/api/timeseries') {
    const metric = url.searchParams.get('metric')
    if (metric !== 'geo' && metric !== 'view' && metric !== 'mailfail')
      return json({ error: { code: 'bad_metric', message: 'Unknown metric.' } } satisfies TimeseriesError, 400)
    const asked = url.searchParams.get('range') ?? '7d'
    if (!RANGES.includes(asked))
      return json({ error: { code: 'bad_range', message: 'Unknown range.' } } satisfies TimeseriesError, 400)
    const range = asked as SeriesRangeKey
    // No mail has failed in the stub's world.
    const points = metric === 'mailfail' ? [] : stubPoints(range, now)
    return json({ metric, range, points } satisfies TimeseriesResponse)
  }
  if (path.startsWith('/api/views/')) return json({ views: method === 'POST' ? 4 : 3 } satisfies ViewsResponse)
  if (path === '/api/visit' && method === 'GET')
    return json({ country: 'NO', countable: true, note: 'A probe; the stub stores nothing.' } satisfies VisitProbe)
  if (path === '/api/csp-report') return { status: 204, body: '' }
  return json({ ok: true } satisfies ApiOk) // POST /api/visit, POST /api/contact
}
