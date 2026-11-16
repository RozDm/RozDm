// GET /api/geo — visits per country, all time, from D1; edge-cached 60 s.
import type { GeoResponse } from '../api-types'
import { apiError, cachedApiJson, putCachedApiJson } from '../http'
import { readCountries } from '../domain/geo-store'

// Short TTL so a fresh visit shows up on the map within a minute. The
// underlying D1 query is cheap (single table aggregate) and traffic is
// low — no need to nurse this with a long cache. Bumping back up to 300s
// once traffic grows costs ~one config edit.
const GEO_CACHE_TTL_S = 60

export async function handleGeo(url: URL, env: Env, ctx: ExecutionContext): Promise<Response | null> {
  if (url.pathname !== '/api/geo') return null
  // Canonical key: path only — the response takes no parameters, so any query
  // string is noise that must not fragment (and thereby bypass) the cache.
  const cache = await cachedApiJson(`${url.origin}${url.pathname}`)
  if (cache.hit) return cache.hit

  const countries = await readCountries(env)
  // A failed read is a 503 (never cached), not an empty map: an empty 200
  // read as "no visitors yet" on the site and as health to smoke.sh and the
  // watchdog, which probe D1 through this endpoint (docs/history.md).
  if (!countries) return apiError('unavailable')
  return putCachedApiJson(ctx, cache.key, JSON.stringify({ countries } satisfies GeoResponse), GEO_CACHE_TTL_S)
}
