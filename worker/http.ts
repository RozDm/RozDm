// Shared HTTP helpers for the /api/* routes: JSON answers, the one error shape, edge cache, throttle, capped body reads.
import type { ApiError, ApiErrorCode } from './api-types'
import { ENFORCED_CSP, HSTS, applyBaseHeaders } from './csp'
import { clientKey } from './ip'

// Per-client throttle for the public write endpoints (wrangler.jsonc
// ratelimits): keyed per IPv4 address or IPv6 /64 (worker/ip.ts).
// `scope` keeps each endpoint's budget separate. Fails open: a limiter hiccup
// (or a binding missing in tests/dev) must never drop a real visit.
export async function allowWrite(env: Env, request: Request, scope: string): Promise<boolean> {
  const ip = request.headers.get('cf-connecting-ip')
  if (!ip || !env.WRITE_LIMITER) return true
  try {
    return (await env.WRITE_LIMITER.limit({ key: `${scope}:${clientKey(ip)}` })).success
  } catch {
    return true
  }
}

export function apiJson(body: string, status = 200, cacheControl = 'no-store'): Response {
  const response = new Response(body, {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': cacheControl },
  })
  applyBaseHeaders(response.headers)
  response.headers.set('Strict-Transport-Security', HSTS)
  response.headers.set('Content-Security-Policy', ENFORCED_CSP)
  return response
}

// Each code's HTTP status and message — one table, so a code answers alike
// on every route. The statuses are the ones the routes always sent: clients
// (components/contact/ContactForm.tsx) and smoke.sh branch on them.
export const API_ERRORS: Record<ApiErrorCode, { status: number; message: string }> = {
  bad_slug: { status: 400, message: 'The slug is not a valid post slug.' },
  bad_metric: { status: 400, message: 'Unknown metric: use view, geo or mailfail.' },
  bad_request: { status: 400, message: 'The body is not JSON.' },
  forbidden: { status: 403, message: 'Only the site itself may send this.' },
  challenge_required: { status: 403, message: 'A Turnstile token is required.' },
  challenge_failed: { status: 403, message: 'The Turnstile check failed.' },
  not_found: { status: 404, message: 'No such endpoint.' },
  method_not_allowed: { status: 405, message: 'Method not allowed.' },
  payload_too_large: { status: 413, message: 'The body is too large.' },
  invalid: { status: 422, message: 'A field is missing or out of bounds.' },
  rate_limited: { status: 429, message: 'Too many requests; try again later.' },
  send_failed: { status: 502, message: 'The message could not be sent; nothing was stored.' },
  unavailable: { status: 503, message: 'The data store is unavailable.' },
}

// The refusal: `{ error: { code, message } }` (ApiError), never cached.
export function apiError(code: ApiErrorCode): Response {
  const { status, message } = API_ERRORS[code]
  return apiJson(JSON.stringify({ error: { code, message } } satisfies ApiError), status)
}

// Edge-cached read for JSON endpoints whose source-of-truth (KV/D1) changes
// slowly. The caller passes a canonical URL — built from the validated
// parameters only, never the raw request URL — so junk query params
// (`?x=1`, `?x=2`, …) collapse onto one cache entry instead of each
// bypassing the cache and hitting D1/AE directly. Public, vary-free, GET-only.
//
// Use it as:
//   const cache = await cachedApiJson(canonicalUrl)
//   if (cache.hit) return cache.hit
//   const body = ...build fresh body...
//   return putCachedApiJson(ctx, cache.key, body, TTL_SECONDS)
export async function cachedApiJson(canonicalUrl: string): Promise<{ hit: Response | null; key: Request }> {
  const key = new Request(canonicalUrl, { method: 'GET' })
  const hit = await caches.default.match(key)
  return { hit: hit ? withStoredTtl(hit) : null, key }
}

// On a cache HIT, Cloudflare's zone-level Browser Cache TTL (4 h by default)
// rewrote the stored max-age (60 → 14400) while leaving s-maxage alone.
// Restore the TTL we put in so browsers and shared caches don't hold a
// 60-second status snapshot for four hours. zone-rules.yml now sets Browser
// Cache TTL → "Respect Existing Headers", which stops the rewrite; this stays
// as the backstop if that setting drifts (the front end fetches with
// no-store either way).
function withStoredTtl(hit: Response): Response {
  const ttl = /s-maxage=(\d+)/.exec(hit.headers.get('Cache-Control') ?? '')?.[1]
  if (!ttl) return hit
  const response = new Response(hit.body, hit)
  response.headers.set('Cache-Control', `public, max-age=${ttl}, s-maxage=${ttl}`)
  return response
}

export function putCachedApiJson(ctx: ExecutionContext, key: Request, body: string, seconds: number): Response {
  const response = apiJson(body, 200, `public, max-age=${seconds}, s-maxage=${seconds}`)
  // Clone before put: the body stream is single-use, and we still need to
  // return the original response to the client.
  ctx.waitUntil(caches.default.put(key, response.clone()))
  return response
}

// A request body as text, or null once it passes `max` bytes — read in
// chunks and abandoned there, so an oversized body is never held whole.
export async function readCapped(request: Request, max: number): Promise<string | null> {
  if (!request.body) return ''
  const reader = request.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.byteLength
    if (total > max) {
      await reader.cancel()
      return null
    }
    chunks.push(value)
  }
  const bytes = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  return new TextDecoder().decode(bytes)
}
