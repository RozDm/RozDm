// POST /api/csp-report — browsers' CSP violation reports, kept as Analytics Engine points.
// metaCsp() in ../csp.ts points report-to here, through the
// Reporting-Endpoints header in public/_headers. D1 and KV are untouched;
// WRITE_LIMITER caps one client at 20 POSTs/min; the point itself is
// domain/csp-report-store.ts.
//
// Always answers 204 to a POST, even for junk: a browser's report delivery
// must never see an error it would retry, and an attacker learns nothing.
// Any other method gets the 405 every route sends (refuseMethod), which is how
// the smoke test confirms the route is wired.
import { allowWrite, readCapped, refuseMethod } from '../http'
import { CSP_REPORT_PATH, applyBaseHeaders } from '../csp'
import { parseJson } from '../validate'
import { recordCspReport } from '../domain/csp-report-store'

// A real report is a few hundred bytes; Reporting API batches stay well
// under this. Anything bigger is dropped unread.
const MAX_BODY_BYTES = 64 * 1024

function noContent(): Response {
  const response = new Response(null, { status: 204 })
  applyBaseHeaders(response.headers)
  return response
}

export async function handleCspReport(url: URL, request: Request, env: Env): Promise<Response | null> {
  if (url.pathname !== CSP_REPORT_PATH) return null
  const refused = refuseMethod(request, ['POST'])
  if (refused) return refused

  if (Number(request.headers.get('content-length') ?? '0') > MAX_BODY_BYTES) return noContent()
  // Anyone can POST here; past the per-IP budget, drop reports silently.
  if (!(await allowWrite(env, request, 'csp'))) return noContent()
  // Read with the cap, not request.text(): a chunked body has no
  // Content-Length to refuse it by above.
  const text = await readCapped(request, MAX_BODY_BYTES).catch(() => null)
  if (!text) return noContent()

  const payload = parseJson(text)
  if (payload !== undefined) recordCspReport(env, payload, url.origin)
  return noContent()
}
