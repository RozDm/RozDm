// POST /api/visit — the once-per-day Besøk beacon; records the visitor's country.
// The single "Besøk" beacon. The client fires it once per
// browser per day, on the first human input, never under automation
// (lib/client/visit.ts), so a visit counts once no matter how many pages or tabs. The Worker reads
// request.cf.country here and records it via recordGeo (domain/geo-store.ts) — D1 `geo` (the
// "Hvor leserne kommer fra" map) and an AE point (the "Besøk" time-series)
// come from this one call, so the map and the chart are two views of the
// same dataset.
//
// GET is a harmless self-diagnostic (shows the caller's own country and
// whether it would count; stores nothing) — handy when the map looks empty,
// e.g. to tell "ad-blocker swallowed the POST" from "edge sees no country".
import type { VisitErrorCode, VisitProbe, VisitResponse } from '../api-types'
import { allowWrite, apiError, apiJson, refuseMethod } from '../http'
import { isCountableCountry, isWriteAllowed } from '../domain/metrics'
import { recordGeo } from '../domain/geo-store'

// This route refuses only with its own codes (VisitErrorCode); tsc holds it to that.
const refuse: (code: VisitErrorCode) => Response = apiError

export async function handleVisit(
  url: URL,
  request: Request,
  env: Env,
  ctx: ExecutionContext,
): Promise<Response | null> {
  if (url.pathname !== '/api/visit') return null
  const refused = refuseMethod(request, ['GET', 'POST'])
  if (refused) return refused

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

  if (!isWriteAllowed(request.headers, url.origin)) return refuse('forbidden')
  if (!(await allowWrite(env, request, 'visit'))) return refuse('rate_limited')

  recordGeo(env, ctx, request.cf?.country, {
    asn: request.cf?.asn,
    org: request.cf?.asOrganization,
  })
  return apiJson(JSON.stringify({ ok: true } satisfies VisitResponse))
}
