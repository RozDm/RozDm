import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SeriesRangeKey, TimeseriesResponse } from '@/worker/api-types'
import { SERIES_TTL_MS } from '@/lib/client/timeseries'
import { parseRange } from '@/worker/domain/timeseries'

const body = (range: TimeseriesResponse['range']): TimeseriesResponse => ({ metric: 'geo', range, points: [] })
const ok = (range: TimeseriesResponse['range']) => new Response(JSON.stringify(body(range)), { status: 200 })

// The module keeps its cache at module level (and vitest runs with isolate:
// false), so each test loads a fresh copy.
async function load() {
  vi.resetModules()
  return (await import('@/lib/client/timeseries')).fetchSeries
}

// The client mirrors the Worker's edge-cache TTLs (nothing runtime may be
// imported from worker/ in the app; a test may).
describe('SERIES_TTL_MS', () => {
  it.each(Object.keys(SERIES_TTL_MS) as SeriesRangeKey[])("%s equals the Worker's ttlSeconds", (key) => {
    expect(SERIES_TTL_MS[key]).toBe(parseRange(key)!.range.ttlSeconds * 1000)
  })
  it('covers every range the Worker serves', () => {
    for (const key of ['24h', '7d', '30d', 'all']) expect(parseRange(key), key).not.toBeNull()
    expect(Object.keys(SERIES_TTL_MS).sort()).toEqual(['24h', '30d', '7d', 'all'])
  })
})

describe('fetchSeries', () => {
  const fetchMock = vi.fn()

  beforeEach(() => {
    vi.useFakeTimers()
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('shares one request per range within its TTL', async () => {
    fetchMock.mockImplementation(() => Promise.resolve(ok('7d')))
    const fetchSeries = await load()
    const a = fetchSeries('7d')
    vi.advanceTimersByTime(299_000)
    const b = fetchSeries('7d')
    expect(b).toBe(a)
    expect(await a).toEqual(body('7d'))
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledWith('/api/timeseries?metric=geo&range=7d', { cache: 'no-store' })
  })

  it("fetches again once the range's TTL has passed", async () => {
    fetchMock.mockImplementation(() => Promise.resolve(ok('24h')))
    const fetchSeries = await load()
    await fetchSeries('24h')
    vi.advanceTimersByTime(59_000)
    await fetchSeries('24h')
    expect(fetchMock).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(1_000)
    await fetchSeries('24h')
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('keeps each range for its own TTL (24h 60 s, 7d 300 s, 30d 600 s, all 900 s)', async () => {
    fetchMock.mockImplementation((url: string) => Promise.resolve(ok(url.split('range=')[1] as '24h')))
    const fetchSeries = await load()
    for (const r of ['24h', '7d', '30d', 'all'] as const) await fetchSeries(r)
    expect(fetchMock).toHaveBeenCalledTimes(4)
    vi.advanceTimersByTime(301_000)
    for (const r of ['24h', '7d', '30d', 'all'] as const) await fetchSeries(r)
    expect(fetchMock).toHaveBeenCalledTimes(6) // 24h and 7d expired, 30d and all kept
    vi.advanceTimersByTime(300_000)
    for (const r of ['30d', 'all'] as const) await fetchSeries(r)
    expect(fetchMock).toHaveBeenCalledTimes(7) // 30d expired (601 s), all (601 s) still kept
    vi.advanceTimersByTime(300_000)
    await fetchSeries('all')
    expect(fetchMock).toHaveBeenCalledTimes(8)
  })

  it('forgets a failed request so the next call retries', async () => {
    fetchMock.mockResolvedValueOnce(new Response('nope', { status: 500 })).mockResolvedValueOnce(ok('30d'))
    const fetchSeries = await load()
    await expect(fetchSeries('30d')).rejects.toThrow('http 500')
    expect(await fetchSeries('30d')).toEqual(body('30d'))
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('forgets a network failure too', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('offline')).mockResolvedValueOnce(ok('all'))
    const fetchSeries = await load()
    await expect(fetchSeries('all')).rejects.toThrow('offline')
    await fetchSeries('all')
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('does not share between ranges', async () => {
    fetchMock.mockImplementation((url: string) => Promise.resolve(ok(url.split('range=')[1] as '24h')))
    const fetchSeries = await load()
    expect((await fetchSeries('24h')).range).toBe('24h')
    expect((await fetchSeries('7d')).range).toBe('7d')
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})
