// POST /api/visit — the once-per-day Besøk beacon; records the visitor's country.
// POST /api/visit — the single "Besøk" beacon. The client fires it once per
// browser per day, on the first human input, never under automation
// (lib/client/visit.ts), so a visit counts once no matter how many pages or tabs. The Worker reads
// request.cf.country here and records it via recordGeo — D1 `geo` (the
// "Hvor leserne kommer fra" map) and an AE point (the "Besøk" time-series)
// come from this one call, so the map and the chart are two views of the
// same dataset.
//
// GET is a harmless self-diagnostic (shows the caller's own country and
// whether it would count; stores nothing) — handy when the map looks empty,
// e.g. to tell "ad-blocker swallowed the POST" from "edge sees no country".
import type { VisitError, VisitProbe, VisitResponse } from '../api-types'
import { allowWrite, apiJson } from '../http'
import { isWriteAllowed, isCountableCountry } from '../metrics'
import { recordGeo } from './geo'

export async function handleVisit(
  url: URL,
  request: Request,
  env: Env,
  ctx: ExecutionContext,
): Promise<Response | null> {
  if (url.pathname !== '/api/visit') return null

  if (request.method === 'GET') {
    const c = request.cf?.country
    return apiJson(
      JSON.stringify({
        country: typeof c === 'string' ? c : null,
        countable: typeof c === 'string' && isCountableCountry(c),
        note: 'A real visit is recorded by the POST beacon from the page, not this GET.',
      } satisfies VisitProbe),
    )
  }

  if (request.method !== 'POST') return null

  if (!isWriteAllowed(request.headers, url.origin)) {
    return apiJson(JSON.stringify({ error: 'forbidden' } satisfies VisitError), 403)
  }
  if (!(await allowWrite(env, request, 'visit'))) {
    return apiJson(JSON.stringify({ error: 'rate limited' } satisfies VisitError), 429)
  }

  recordGeo(env, ctx, request.cf?.country, {
    asn: request.cf?.asn,
    org: request.cf?.asOrganization,
  })
  return apiJson(JSON.stringify({ ok: true } satisfies VisitResponse))
}
