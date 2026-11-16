// Post view counters: the published-post check (via ASSETS), the D1 count + AE point of a view, the D1 read.
// Worker-only (D1, AE, ASSETS). Slug rules and the write gate: metrics.ts.

// The header gates are spoofable (any client can send Sec-Fetch-Site and a
// browser UA), so a POST must also prove the slug is a real published post
// before it may mint a D1 row — otherwise junk slugs accumulate in `views`
// forever. The static export is the source of truth: the post page exists
// iff the slug is live (drafts never reach the export). Checked via the
// ASSETS binding — a Worker can't fetch its own public URL. The slug is the
// post's view key (lib/server/blog.ts viewKey): the Norwegian slug for a post that
// has one, else an English-only post's own slug under /en/blog/.
export async function isPublishedPost(env: Env, origin: string, slug: string): Promise<boolean> {
  for (const base of ['/blogg/', '/en/blog/']) {
    const page = await env.ASSETS.fetch(new Request(`${origin}${base}${slug}/`))
    await page.body?.cancel()
    if (page.status === 200) return true
  }
  return false
}

// One view: the D1 counter's new value, or null when the upsert failed
// (logged; the route then answers like a GET).
export async function countView(env: Env, slug: string): Promise<number | null> {
  const row = await env.METRICS.prepare(
    'INSERT INTO views (slug, count) VALUES (?1, 1) ON CONFLICT(slug) DO UPDATE SET count = count + 1 RETURNING count',
  )
    .bind(slug)
    .first<{ count: number }>()
    .catch((err) => {
      console.error('views: D1 upsert failed', err)
      return null
    })
  if (!row) return null
  // Append a time-series point alongside the D1 increment. Sampled,
  // append-only, so it doesn't fight the D1 counter — D1 stays the truth for
  // totals, AE answers "when".
  try {
    env.METRICS_AE.writeDataPoint({ indexes: [slug], blobs: ['view', slug], doubles: [1] })
  } catch {}
  return row.count
}

// The post's count; 0 when it has none or the read failed.
export async function readViews(env: Env, slug: string): Promise<number> {
  const row = await env.METRICS.prepare('SELECT count FROM views WHERE slug = ?1')
    .bind(slug)
    .first<{ count: number }>()
    .catch(() => null)
  return row?.count ?? 0
}
