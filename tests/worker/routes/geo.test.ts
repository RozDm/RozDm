import { afterEach, describe, expect, it, vi } from 'vitest'
import { handleGeo } from '../../../worker/routes/geo'
import { errorBody, makeCtx, makeEnv } from '../fakes'

const ORIGIN = 'https://rozsoshnykh.no'

describe('/api/geo', () => {
  const url = new URL(`${ORIGIN}/api/geo`)
  const puts: string[] = []
  const stubCache = () => {
    puts.length = 0
    vi.stubGlobal('caches', {
      default: { match: async () => undefined, put: async (key: Request) => void puts.push(key.url) },
    })
  }
  afterEach(() => vi.unstubAllGlobals())

  it('answers the counts with 200 and edge-caches them', async () => {
    stubCache()
    const fake = makeEnv()
    fake.db.exec("INSERT INTO geo (country, count) VALUES ('NO', 3)")
    const { ctx, settle } = makeCtx()
    const res = (await handleGeo(url, new Request(url), fake.env, ctx))!
    await settle()
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ countries: { NO: 3 } })
    expect(puts).toEqual([url.href])
  })

  // A dead D1 once answered an empty map with a 200, which smoke.sh and the
  // watchdog took for health (docs/history.md).
  it('answers a failed D1 read with an uncached 503, never an empty map', async () => {
    stubCache()
    const failing = { prepare: () => ({ all: async () => Promise.reject(new Error('D1_ERROR')) }) }
    const fake = makeEnv({ METRICS: failing })
    const { ctx, settle } = makeCtx()
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const res = (await handleGeo(url, new Request(url), fake.env, ctx))!
    await settle()
    expect(res.status).toBe(503)
    expect(res.headers.get('cache-control')).toBe('no-store')
    expect(await res.json()).toEqual(errorBody('unavailable'))
    expect(puts).toEqual([])
    expect(error).toHaveBeenCalledWith('geo: D1 read failed', expect.any(Error))
    error.mockRestore()
  })
})
