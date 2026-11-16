import { describe, expect, it } from 'vitest'
import { handleViews } from '../../../worker/routes/views'
import { BROWSER_HEADERS, makeEnv } from '../fakes'

const ORIGIN = 'https://rozsoshnykh.no'

describe('/api/views/<slug>', () => {
  const post = (slug: string, headers = BROWSER_HEADERS) =>
    new Request(`${ORIGIN}/api/views/${slug}`, { method: 'POST', headers })

  it('counts a view of a published post and writes an AE point', async () => {
    const fake = makeEnv()
    const url = new URL(`${ORIGIN}/api/views/velkommen`)
    expect(await (await handleViews(url, post('velkommen'), fake.env))!.json()).toEqual({ views: 1 })
    expect(await (await handleViews(url, post('velkommen'), fake.env))!.json()).toEqual({ views: 2 })
    expect(fake.aePoints.map((p) => p.blobs)).toEqual([
      ['view', 'velkommen'],
      ['view', 'velkommen'],
    ])
  })

  it('counts an English-only post under its own slug', async () => {
    const fake = makeEnv()
    const url = new URL(`${ORIGIN}/api/views/english-only`)
    expect(await (await handleViews(url, post('english-only'), fake.env))!.json()).toEqual({ views: 1 })
  })

  it('never mints a row for a slug that is not a published page', async () => {
    const fake = makeEnv()
    const url = new URL(`${ORIGIN}/api/views/finnes-ikke`)
    expect(await (await handleViews(url, post('finnes-ikke'), fake.env))!.json()).toEqual({ views: 0 })
    expect(fake.db.prepare('SELECT COUNT(*) AS n FROM views').get()).toEqual({ n: 0 })
  })

  it('reads without counting on GET and for bots', async () => {
    const fake = makeEnv()
    const url = new URL(`${ORIGIN}/api/views/velkommen`)
    await handleViews(url, post('velkommen', { ...BROWSER_HEADERS, 'user-agent': 'Googlebot/2.1' }), fake.env)
    expect(await (await handleViews(url, new Request(url), fake.env))!.json()).toEqual({ views: 0 })
  })

  it('reads without counting from a datacenter network', async () => {
    const fake = makeEnv()
    const url = new URL(`${ORIGIN}/api/views/velkommen`)
    const req = post('velkommen')
    Object.defineProperty(req, 'cf', { value: { asn: 16509 } }) // AWS
    expect(await (await handleViews(url, req, fake.env))!.json()).toEqual({ views: 0 })
    expect(fake.aePoints).toEqual([])
  })

  it('past the per-IP budget a POST reads instead of counting', async () => {
    const fake = makeEnv()
    fake.setRateLimit(1)
    const url = new URL(`${ORIGIN}/api/views/velkommen`)
    expect(await (await handleViews(url, post('velkommen'), fake.env))!.json()).toEqual({ views: 1 })
    expect(await (await handleViews(url, post('velkommen'), fake.env))!.json()).toEqual({ views: 1 })
    expect(fake.aePoints).toHaveLength(1)
  })

  it('rejects malformed slugs', async () => {
    const url = new URL(`${ORIGIN}/api/views/Bad_Slug`)
    expect((await handleViews(url, new Request(url), makeEnv().env))!.status).toBe(400)
  })
})
