// The /api/* wire contract: request and response shapes shared by the Worker routes and the front end.
// Types only — no runtime code and no globals (neither DOM nor Workers), so
// both tsconfigs import it: the Worker as './api-types', the app as
// '@/worker/api-types'. A route builds its body with `satisfies` one of these;
// a client reads its answer as one. Change a shape here and both sides (and
// e2e/api-stub.ts) fail to typecheck until they follow.

// The refusal every route answers with: a machine `code` (what clients
// branch on) and a human `message` (for logs and curl; never shown as is).
// `E` narrows the codes one route can send. The code fixes the HTTP status
// (worker/http.ts API_ERRORS), so a code means the same thing on every route.
export interface ApiError<E extends string = ApiErrorCode> {
  error: { code: E; message: string }
}

// Every code the API can send. Two are the same on every route: `not_found`
// (404, an /api/ path no route claims: worker/index.ts) and
// `method_not_allowed` (405, with `Allow`: worker/http.ts refuseMethod).
export type ApiErrorCode =
  | ViewsErrorCode
  | GeoErrorCode
  | VisitErrorCode
  | TimeseriesErrorCode
  | ContactErrorCode
  | 'not_found'
  | 'method_not_allowed'

export interface ApiOk {
  ok: true
}

// ── GET /api/status ─────────────────────────────────────────────────────────
// The cron's KV snapshot (worker/domain/status.ts buildStatusData), or EmptyStatus when
// KV has none or its read failed.

// Per monitor, without its URL (one is an admin login: worker/domain/status.ts).
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
export type ViewsErrorCode = 'bad_slug' // 400
export type ViewsError = ApiError<ViewsErrorCode>

// ── GET /api/geo ────────────────────────────────────────────────────────────
// Visits per ISO country code, all time (D1). A failed read is a 503.
export interface GeoResponse {
  countries: Record<string, number>
}
export type GeoErrorCode = 'unavailable' // 503
export type GeoError = ApiError<GeoErrorCode>

// ── /api/visit ──────────────────────────────────────────────────────────────
// POST (no body) → ApiOk; GET is a diagnostic that stores nothing.
export type VisitResponse = ApiOk
export interface VisitProbe {
  country: string | null
  countable: boolean
  note: string
}
export type VisitErrorCode = 'forbidden' | 'rate_limited' // 403, 429
export type VisitError = ApiError<VisitErrorCode>

// ── GET /api/timeseries?metric=…&range=… ────────────────────────────────────
export type SeriesMetric = 'view' | 'geo' | 'mailfail'
// A missing range answers as '7d'; an unknown one is a 400 `bad_range`.
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
export type TimeseriesErrorCode = 'bad_metric' | 'bad_range' // 400
export type TimeseriesError = ApiError<TimeseriesErrorCode>

// ── POST /api/contact ───────────────────────────────────────────────────────
// JSON body. The Worker trims and validates it (worker/domain/contact.ts
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
  | 'payload_too_large' // 413
  | 'forbidden' // 403: isWriteAllowed
  | 'bad_request' // 400: not JSON
  | 'invalid' // 422: validateContact
  | 'rate_limited' // 429: burst cap or a D1 window
  | 'challenge_required' // 403: Turnstile on, no token
  | 'challenge_failed' // 403: siteverify said no
  | 'send_failed' // 502: the mail didn't go (nothing stored)

export type ContactResponse = ApiOk | ApiError<ContactErrorCode>

// ── POST /api/csp-report ────────────────────────────────────────────────────
// The browser's own Reporting API body (worker/csp.ts parseCspReports reads it);
// always a 204 with no body; any other method is the shared 405.
