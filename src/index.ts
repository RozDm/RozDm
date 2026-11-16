// Cloudflare Worker for the portfolio site.
//
// Runs only for /api/* and the MTA-STS policy (assets.run_worker_first in
// wrangler.jsonc). Pages and files are served by the asset server straight
// from the static export, with their headers from public/_headers, each
// page's hash CSP baked in at build (scripts/finalize-export.mjs), and the
// redirects in out/_redirects and the zone (zone-rules.yml) — none of it
// costs a Worker request, and it keeps working when the free plan's 100k
// requests/day run out. Here:
//   1. HTTPS, then /.well-known/mta-sts.txt on any host (routes/mta-sts.ts).
//   2. Canonical host for the API (www, mta-sts → apex).
//   3. Dispatches /api/* to the route handlers in src/routes/ (HTTP only;
//      the logic and bindings are src/domain/).
//   4. An /api/ path no route claims gets the asset server's 404 page.
// The crons dispatch to domain/status-store.ts and domain/contact-store.ts.
//
// Types for Env and the Workers runtime come from worker-configuration.d.ts,
// generated with `npm run cf-typegen` — rerun it after changing wrangler.jsonc.

import { ENFORCED_CSP, HEADER_CSP, HSTS, applyBaseHeaders } from './csp'
import { CONTACT_PRUNE_CRON } from './domain/contact'
import { pruneContactRows } from './domain/contact-store'
import { runHealthChecks } from './domain/status-store'
import { handleStatus } from './routes/status'
import { handleViews } from './routes/views'
import { handleGeo } from './routes/geo'
import { handleContact } from './routes/contact'
import { handleTimeseries } from './routes/timeseries'
import { handleVisit } from './routes/visit'
import { handleCspReport } from './routes/csp-report'
import { handleMtaSts } from './routes/mta-sts'

// `secure` flags whether the incoming request was HTTPS. Per RFC 6797, HSTS
// must not be emitted on responses to plain-HTTP requests (the client is
// required to ignore it anyway). Defaults true; the HTTP→HTTPS redirect
// passes false explicitly.
function redirect301(target: string | null, location: string, secure = true): Response {
  const response = new Response(target, {
    status: 301,
    headers: location.startsWith('http')
      ? { Location: location, 'Content-Type': 'text/html; charset=utf-8' }
      : { Location: location },
  })
  applyBaseHeaders(response.headers)
  if (secure) response.headers.set('Strict-Transport-Security', HSTS)
  response.headers.set('Content-Security-Policy', ENFORCED_CSP)
  return response
}

export default {
  async scheduled(controller, env, ctx) {
    if (controller.cron === CONTACT_PRUNE_CRON) {
      ctx.waitUntil(pruneContactRows(env))
    } else {
      ctx.waitUntil(runHealthChecks(env))
    }
  },

  async fetch(request, env, ctx) {
    const url = new URL(request.url)

    // Force HTTPS. Per RFC 6797 the HSTS header on this plain-HTTP response
    // must be suppressed — clients are required to ignore it anyway.
    if (url.protocol === 'http:') {
      url.protocol = 'https:'
      const target = url.toString()
      const safeTarget = target.replace(/[<>"]/g, '')
      const body = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Redirecting</title><meta http-equiv="refresh" content="0; url=${safeTarget}"></head><body>Redirecting to <a href="${safeTarget}">${safeTarget}</a></body></html>`
      return redirect301(body, target, false)
    }

    // The MTA-STS policy, before the host checks: senders fetch it from
    // mta-sts.rozsoshnykh.no and must get it there, never a redirect.
    const policy = await handleMtaSts(url)
    if (policy) return policy

    // Canonical host for the API. www (and mta-sts, but for its policy) is
    // redirected at the edge (Single Redirect, zone-rules.yml) before it gets
    // here — this is the backstop. workers.dev is off (wrangler.jsonc).
    if (url.hostname === 'www.rozsoshnykh.no' || url.hostname === 'mta-sts.rozsoshnykh.no') {
      url.hostname = 'rozsoshnykh.no'
      return redirect301(null, url.toString())
    }

    // /api/* dispatch — each handler returns null when the path isn't its own.
    const apiResponse =
      (await handleStatus(url, env, ctx)) ??
      (await handleViews(url, request, env)) ??
      (await handleGeo(url, env, ctx)) ??
      (await handleVisit(url, request, env, ctx)) ??
      (await handleTimeseries(url, env, ctx)) ??
      (await handleContact(url, request, env)) ??
      (await handleCspReport(url, request, env))
    if (apiResponse) return apiResponse

    // An /api/ path no route claims: the asset server's 404 page. _headers
    // never applies to a Worker response, so the headers it would have had
    // are set here; HEADER_CSP, not ENFORCED_CSP — the page's own <meta>
    // policy holds the hashes its inline scripts need.
    const asset = await env.ASSETS.fetch(request)
    const response = new Response(asset.body, asset)
    applyBaseHeaders(response.headers)
    response.headers.set('Strict-Transport-Security', HSTS)
    response.headers.set('Content-Security-Policy', HEADER_CSP)
    return response
  },
} satisfies ExportedHandler<Env>
