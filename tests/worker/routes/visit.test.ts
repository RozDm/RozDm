import { describe, expect, it } from 'vitest'
import { handleVisit } from '../../../worker/routes/visit'
import { BROWSER_HEADERS, makeCtx, makeEnv } from '../fakes'

const ORIGIN = 'https://rozsoshnykh.no'

describe('/api/visit', () => {
  const url = new URL(`${ORIGIN}/api/visit`)
  const visit = (cf: Record<string, unknown>, headers = BROWSER_HEADERS) => {
    const req = new Request(url, { method: 'POST', headers })
    Object.defineProperty(req, 'cf', { value: cf })
    return req
  }

  it('counts the country in D1 and writes an AE point with the network', async () => {
    const fake = makeEnv()
    const { ctx, settle } = makeCtx()
    const res = (await handleVisit(
      url,
      visit({ country: 'NO', asn: 2119, asOrganization: 'Telenor Norge AS' }),
      fake.env,
      ctx,
    ))!
    await settle()
    expect(res.status).toBe(200)
    expect(fake.db.prepare('SELECT country, count FROM geo').all()).toEqual([{ country: 'NO', count: 1 }])
    expect(fake.aePoints[0].blobs).toEqual(['geo', 'NO', 'AS2119', 'Telenor Norge AS'])
  })

  it('keeps datacenter networks off the map but logs them to AE as bot', async () => {
    const fake = makeEnv()
    const { ctx, settle } = makeCtx()
    const res = (await handleVisit(
      url,
      visit({ country: 'US', asn: 16509, asOrganization: 'AMAZON-02' }),
      fake.env,
      ctx,
    ))!
    await settle()
    expect(res.status).toBe(200)
    expect(fake.db.prepare('SELECT COUNT(*) AS n FROM geo').get()).toEqual({ n: 0 })
    expect(fake.aePoints.map((p) => p.blobs)).toEqual([['bot', 'US', 'AS16509', 'AMAZON-02']])
  })

  it('skips pseudo-countries and refuses bots', async () => {
    const fake = makeEnv()
    const { ctx, settle } = makeCtx()
    await handleVisit(url, visit({ country: 'T1' }), fake.env, ctx)
    const bot = (await handleVisit(
      url,
      visit({ country: 'NO' }, { ...BROWSER_HEADERS, 'user-agent': 'HeadlessChrome' }),
      fake.env,
      ctx,
    ))!
    await settle()
    expect(bot.status).toBe(403)
    expect(fake.db.prepare('SELECT COUNT(*) AS n FROM geo').get()).toEqual({ n: 0 })
    expect(fake.aePoints).toEqual([])
  })

  it('answers 429 past the per-IP budget and records nothing more', async () => {
    const fake = makeEnv()
    fake.setRateLimit(1)
    const { ctx, settle } = makeCtx()
    expect((await handleVisit(url, visit({ country: 'NO' }), fake.env, ctx))!.status).toBe(200)
    expect((await handleVisit(url, visit({ country: 'NO' }), fake.env, ctx))!.status).toBe(429)
    await settle()
    expect(fake.db.prepare('SELECT country, count FROM geo').all()).toEqual([{ country: 'NO', count: 1 }])
  })
})
