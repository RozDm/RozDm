// Visitor-country storage: recordGeo() (D1 `geo` upsert + AE point, from the /api/visit beacon) and the D1 read behind /api/geo.
// Worker-only (D1, AE). Country/ASN rules: metrics.ts.
import { countriesFromRows, isCountableCountry, isDatacenterAsn } from './metrics'

// Atomic upsert — no client-side batching or read-modify-write races, and the
// D1 free tier allows 100k writes/day vs KV's 1000.
//
// `network` (request.cf.asn / asOrganization) rides along on the AE point
// only — never in D1. A visit from a cloud/hosting network (isDatacenterAsn)
// isn't a reader: it skips D1 (the map and the Alt total) and lands in AE as
// blob1='bot' instead of 'geo', so analytics-report can show what the filter
// dropped. Network operator, not a person: no IP is stored.
export function recordGeo(
  env: Env,
  ctx: ExecutionContext,
  country: unknown,
  network: { asn?: unknown; org?: unknown } = {},
): void {
  if (typeof country !== 'string' || !isCountableCountry(country)) return
  const asn = typeof network.asn === 'number' ? `AS${network.asn}` : ''
  const org = typeof network.org === 'string' ? network.org.slice(0, 96) : ''
  if (isDatacenterAsn(network.asn)) {
    try {
      env.METRICS_AE.writeDataPoint({ indexes: [country], blobs: ['bot', country, asn, org], doubles: [1] })
    } catch {}
    return
  }
  ctx.waitUntil(
    env.METRICS.prepare(
      'INSERT INTO geo (country, count) VALUES (?1, 1) ON CONFLICT(country) DO UPDATE SET count = count + 1',
    )
      .bind(country)
      .run()
      // Logged, not thrown: the 2026-07 D1 outage failed these upserts
      // silently for days while AE kept counting (docs/history.md).
      .catch((err) => console.error('geo: D1 upsert failed', err)),
  )
  // Time-series point so we can graph visits over time. D1 keeps the running
  // total per country; AE keeps the timestamped trail.
  try {
    env.METRICS_AE.writeDataPoint({ indexes: [country], blobs: ['geo', country, asn, org], doubles: [1] })
  } catch {}
}

// Visits per country, all time — or null when the D1 read failed (logged).
export async function readCountries(env: Env): Promise<Record<string, number> | null> {
  const rows = await env.METRICS.prepare('SELECT country, count FROM geo')
    .all<{ country: string; count: number }>()
    .catch((err) => {
      console.error('geo: D1 read failed', err)
      return null
    })
  return rows ? countriesFromRows(rows.results ?? []) : null
}
