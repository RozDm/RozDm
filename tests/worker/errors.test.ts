// Every /api/* refusal has the one shape `{ error: { code, message } }`
// (ApiError, worker/api-types.ts) with the status API_ERRORS fixes for its code,
// as a no-store JSON answer with the Worker's security headers.
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ApiErrorCode } from '../../worker/api-types'
import { API_ERRORS } from '../../worker/http'
import { handleContact } from '../../worker/routes/contact'
import { handleCspReport } from '../../worker/routes/csp-report'
import { handleGeo } from '../../worker/routes/geo'
import { handleStatus } from '../../worker/routes/status'
import { handleTimeseries } from '../../worker/routes/timeseries'
import { handleViews } from '../../worker/routes/views'
import { handleVisit } from '../../worker/routes/visit'
import { BROWSER_HEADERS, makeCtx, makeEnv } from './fakes'

const ORIGIN = 'https://rozsoshnykh.no'

async function expectRefusal(res: Response | null, code: ApiErrorCode, status: number) {
  expect(res).not.toBeNull()
  expect(res!.status).toBe(status)
  expect(API_ERRORS[code].status).toBe(status)
  expect(res!.headers.get('content-type')).toBe('application/json; charset=utf-8')
  expect(res!.headers.get('cache-control')).toBe('no-store')
  expect(res!.headers.get('content-security-policy')).toBeTruthy()
  const body = (await res!.json()) as { error: { message: string } }
  expect(body).toEqual({ error: { code, message: expect.any(String) } })
  expect(Object.keys(body)).toEqual(['error'])
  expect(body.error.message.length).toBeGreaterThan(0)
}

afterEach(() => vi.unstubAllGlobals())
const stubCache = () => vi.stubGlobal('caches', { default: { match: async () => undefined, put: async () => {} } })

describe('the error shape, per route', () => {
  it('/api/views/<slug> — bad_slug, 400', async () => {
    const url = new URL(`${ORIGIN}/api/views/Not_A_Slug`)
    await expectRefusal(await handleViews(url, new Request(url), makeEnv().env), 'bad_slug', 400)
  })

  it('/api/geo — unavailable, 503', async () => {
    stubCache()
    const failing = { prepare: () => ({ all: async () => Promise.reject(new Error('D1_ERROR')) }) }
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const res = await handleGeo(new URL(`${ORIGIN}/api/geo`), makeEnv({ METRICS: failing }).env, makeCtx().ctx)
    await expectRefusal(res, 'unavailable', 503)
  })

  it('/api/visit — forbidden, 403; rate_limited, 429', async () => {
    const url = new URL(`${ORIGIN}/api/visit`)
    const fake = makeEnv()
    const bot = new Request(url, { method: 'POST', headers: { ...BROWSER_HEADERS, 'user-agent': 'curl/8.0' } })
    await expectRefusal(await handleVisit(url, bot, fake.env, makeCtx().ctx), 'forbidden', 403)
    fake.setRateLimit(0)
    const req = new Request(url, { method: 'POST', headers: BROWSER_HEADERS })
    await expectRefusal(await handleVisit(url, req, fake.env, makeCtx().ctx), 'rate_limited', 429)
  })

  it('/api/timeseries — bad_metric, 400', async () => {
    const url = new URL(`${ORIGIN}/api/timeseries?metric=nope`)
    await expectRefusal(await handleTimeseries(url, makeEnv().env, makeCtx().ctx), 'bad_metric', 400)
  })

  it('/api/contact — forbidden, bad_request, invalid', async () => {
    const url = new URL(`${ORIGIN}/api/contact`)
    const post = (body: string, headers: Record<string, string> = BROWSER_HEADERS) =>
      handleContact(url, new Request(url, { method: 'POST', headers, body }), makeEnv().env)
    await expectRefusal(await post('{}', { ...BROWSER_HEADERS, 'sec-fetch-site': 'cross-site' }), 'forbidden', 403)
    await expectRefusal(await post('not json'), 'bad_request', 400)
    await expectRefusal(await post('{"name":"x"}'), 'invalid', 422)
  })

  it('/api/csp-report — method_not_allowed, 405', async () => {
    const url = new URL(`${ORIGIN}/api/csp-report`)
    await expectRefusal(await handleCspReport(url, new Request(url), makeEnv().env), 'method_not_allowed', 405)
  })

  // No refusal of its own: a missing or unreadable snapshot is the empty one.
  it('/api/status — never an error, even when KV fails', async () => {
    stubCache()
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const kv = { get: async () => Promise.reject(new Error('KV down')) }
    const res = (await handleStatus(new URL(`${ORIGIN}/api/status`), makeEnv({ STATUS: kv }).env, makeCtx().ctx))!
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ results: [], history: [] })
  })
})
