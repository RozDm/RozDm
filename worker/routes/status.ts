// GET /api/status — the latest uptime snapshot from KV, edge-cached 60 s.
//
// The dashboard polls every 30–90 s and the footer dot fires once per page,
// so this gets hit on nearly every visit. The KV snapshot only changes when
// the cron runs (every 5 min), so cache the read at the edge for 60 s — well
// under the cron interval, easily under the dashboard's OK refresh, and the
// KV read cost drops to roughly one per minute per colo instead of one per
// page view.
import type { EmptyStatus } from '../api-types'
import { apiJson, cachedApiJson, putCachedApiJson, refuseMethod } from '../http'
import { readStatusSnapshot } from '../domain/status-store'

const STATUS_CACHE_TTL_S = 60
// The answer when KV has no snapshot; a stored one is the cron's StatusData.
const EMPTY_STATUS = JSON.stringify({ results: [], history: [] } satisfies EmptyStatus)

export async function handleStatus(
  url: URL,
  request: Request,
  env: Env,
  ctx: ExecutionContext,
): Promise<Response | null> {
  if (url.pathname !== '/api/status') return null
  const refused = refuseMethod(request, ['GET'])
  if (refused) return refused
  // Canonical key: path only — no parameters, so junk query strings must not
  // fragment (and thereby bypass) the cache.
  const cache = await cachedApiJson(`${url.origin}${url.pathname}`)
  if (cache.hit) return cache.hit

  const snapshot = await readStatusSnapshot(env)
  // Only cache positive snapshots; an empty body (no snapshot, or a KV error)
  // shouldn't pin the bad state at the edge for a minute.
  if (snapshot) return putCachedApiJson(ctx, cache.key, snapshot, STATUS_CACHE_TTL_S)
  return apiJson(EMPTY_STATUS)
}
