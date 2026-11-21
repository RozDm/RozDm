// /api/views/<slug> — GET reads a post's view counter, POST counts one view.
// Only the page's own same-origin fetch() counts, so crawlers and external
// spam can't inflate it; a refused POST answers like a GET.
import type { ViewsErrorCode, ViewsResponse } from '../api-types'
import { allowWrite, apiError, apiJson, refuseMethod } from '../http'
import { isDatacenterAsn, isValidSlug, isWriteAllowed } from '../domain/metrics'
import { countView, isPublishedPost, readViews } from '../domain/views-store'

// This route refuses only with its own codes (ViewsErrorCode); tsc holds it to that.
const refuse: (code: ViewsErrorCode) => Response = apiError

const answer = (views: number) => apiJson(JSON.stringify({ views } satisfies ViewsResponse))

export async function handleViews(url: URL, request: Request, env: Env): Promise<Response | null> {
  const match = url.pathname.match(/^\/api\/views\/([^/]+)$/)
  if (!match) return null
  const refused = refuseMethod(request, ['GET', 'POST'])
  if (refused) return refused

  const slug = match[1]
  if (!isValidSlug(slug)) return refuse('bad_slug')

  if (
    request.method === 'POST' &&
    isWriteAllowed(request.headers, url.origin) &&
    // Cloud/hosting networks are crawlers, not readers — the same filter
    // that keeps them off the Besøk map (metrics.ts DATACENTER_ASNS).
    !isDatacenterAsn(request.cf?.asn) &&
    // Over the per-IP budget → answer like a GET (the reader still sees the
    // count), just without writing.
    (await allowWrite(env, request, 'views')) &&
    (await isPublishedPost(env, url.origin, slug))
  ) {
    const count = await countView(env, slug)
    if (count !== null) return answer(count)
  }

  return answer(await readViews(env, slug))
}
