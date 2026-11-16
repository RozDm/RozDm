// The /api/* answers the browser tests run against — the Worker isn't running
// in e2e; e2e/fixtures.ts routes every /api/* request here. Each answer has
// the status and JSON shape of the real route handler's (src/routes/), and
// tests/worker/api-stub.test.ts holds them to it: a handler change that
// alters an answer fails there until the stub follows. No Playwright import —
// Vitest loads this file too. Bodies `satisfies` the contract (src/api-types.ts).
import type {
  ApiError,
  ApiErrorCode,
  ApiOk,
  GeoResponse,
  SeriesRangeKey,
  StatusResponse,
  TimeseriesError,
  TimeseriesResponse,
  ViewsResponse,
} from '../src/api-types'

export interface StubAnswer {
  status: number
  body: string
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

const RANGES: string[] = ['24h', '7d', '30d', 'all'] satisfies SeriesRangeKey[]

export function apiStub(url: URL, method: string, now = Date.now()): StubAnswer {
  const path = url.pathname
  const json = (body: unknown, status = 200): StubAnswer => ({ status, body: JSON.stringify(body) })
  // The Worker's refusal shape (src/http.ts apiError); the message is free text.
  const refuse = (code: ApiErrorCode, status: number, message: string): StubAnswer =>
    json({ error: { code, message } } satisfies ApiError, status)

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
    const asked = url.searchParams.get('range') ?? ''
    const range = (RANGES.includes(asked) ? asked : '7d') as SeriesRangeKey
    // No mail has failed in the stub's world.
    const points =
      metric === 'mailfail' ? [] : [30, 5, 2].map((h, i) => ({ ts: hourKey(now - h * 3_600_000), value: i + 1 }))
    return json({ metric, range, points } satisfies TimeseriesResponse)
  }
  if (/^\/api\/views\/[^/]+$/.test(path)) return json({ views: method === 'POST' ? 4 : 3 } satisfies ViewsResponse)
  if (path === '/api/visit' && method === 'POST') return json({ ok: true } satisfies ApiOk)
  if (path === '/api/contact' && method === 'POST') return json({ ok: true } satisfies ApiOk)
  return refuse('not_found', 404, 'No such endpoint.')
}
