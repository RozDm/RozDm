// The /api/* wire contract: request and response shapes shared by the Worker routes and the front end.
// Types only — no runtime code and no globals (neither DOM nor Workers), so
// both tsconfigs import it: the Worker as './api-types', the app as
// '@/src/api-types'. A route builds its body with `satisfies` one of these;
// a client reads its answer as one. Change a shape here and both sides (and
// e2e/api-stub.ts) fail to typecheck until they follow.

// The refusal every route answers with; `E` names the codes a route can send.
export interface ApiError<E extends string = string> {
  error: E
}

export interface ApiOk {
  ok: true
}

// ── GET /api/status ─────────────────────────────────────────────────────────
// The cron's KV snapshot (src/status.ts buildStatusData), or EmptyStatus when
// KV has none or its read failed.

// Per monitor, without its URL (one is an admin login: src/status.ts).
export interface PublicMonitorResult {
  name: string
  ok: boolean
  status: number
  ms: number
}

// One cron tick: per-monitor up/down keyed by monitor name.
export interface HistoryEntry {
  at: string
  up: Record<string, boolean>
}

export interface StatusData {
  updatedAt: string
  results: PublicMonitorResult[]
  history: HistoryEntry[]
}

export interface EmptyStatus {
  updatedAt?: undefined
  results: []
  history: []
}

export type StatusResponse = StatusData | EmptyStatus

// ── GET|POST /api/views/<slug> ──────────────────────────────────────────────
// Both answer the count (a refused POST answers like a GET).
export interface ViewsResponse {
  views: number
}
export type ViewsError = ApiError<'bad slug'>

// ── GET /api/geo ────────────────────────────────────────────────────────────
// Visits per ISO country code, all time (D1). A failed read is a 503.
export interface GeoResponse {
  countries: Record<string, number>
}
export type GeoError = ApiError<'unavailable'>

// ── /api/visit ──────────────────────────────────────────────────────────────
// POST (no body) → ApiOk; GET is a diagnostic that stores nothing.
export type VisitResponse = ApiOk
export interface VisitProbe {
  country: string | null
  countable: boolean
  note: string
}
export type VisitError = ApiError<'forbidden' | 'rate limited'>

// ── GET /api/timeseries?metric=…&range=… ────────────────────────────────────
export type SeriesMetric = 'view' | 'geo' | 'mailfail'
// An unknown or missing range answers as '7d'.
export type SeriesRangeKey = '24h' | '7d' | '30d' | 'all'

// `ts` is the bucket start, UTC "YYYY-MM-DD HH:MM:SS"; only non-empty buckets.
export interface SeriesPoint {
  ts: string
  value: number
}

export interface TimeseriesResponse {
  metric: SeriesMetric
  range: SeriesRangeKey
  points: SeriesPoint[]
  // AE unreachable or its secrets unset: `points` is empty, not a quiet week
  // (read by status-watchdog.yml; the chart draws it as empty).
  degraded?: true
}
export type TimeseriesError = ApiError<'bad metric'>

// ── POST /api/contact ───────────────────────────────────────────────────────
// JSON body. The Worker trims and validates it (src/contact.ts
// validateContact); a non-string token reads as none.
export interface ContactRequest {
  name: string
  email: string
  message: string
  turnstileToken?: string | null
  // The honeypot (HONEYPOT_FIELD): a real form leaves it empty; filled → an
  // ApiOk that stores and sends nothing.
  topic?: string
}

export type ContactErrorCode =
  | 'payload too large' // 413
  | 'forbidden' // 403: isWriteAllowed
  | 'bad request' // 400: not JSON
  | 'invalid' // 422: validateContact
  | 'rate limited' // 429: burst cap or a D1 window
  | 'challenge required' // 403: Turnstile on, no token
  | 'challenge failed' // 403: siteverify said no
  | 'send failed' // 502: the mail didn't go (nothing stored)

export type ContactResponse = ApiOk | ApiError<ContactErrorCode>

// ── POST /api/csp-report ────────────────────────────────────────────────────
// The browser's own Reporting API body (src/csp.ts parseCspReports reads it);
// always a 204 with no body. GET → ApiError<'method not allowed'>, 405.
