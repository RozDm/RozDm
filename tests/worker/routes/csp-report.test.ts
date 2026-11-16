import { describe, expect, it } from 'vitest'
import { handleCspReport } from '../../../worker/routes/csp-report'
import { makeEnv } from '../fakes'

const ORIGIN = 'https://rozsoshnykh.no'

describe('/api/csp-report', () => {
  const url = new URL(`${ORIGIN}/api/csp-report`)
  const report = (doc: string, blocked: string) =>
    new Request(url, {
      method: 'POST',
      headers: { 'content-type': 'application/csp-report' },
      body: JSON.stringify({
        'csp-report': { 'document-uri': doc, 'blocked-uri': blocked, 'violated-directive': 'script-src-elem' },
      }),
    })

  it('records an own-origin violation as one AE point and answers 204', async () => {
    const fake = makeEnv()
    const res = (await handleCspReport(url, report(`${ORIGIN}/kontakt/?x=1`, 'inline'), fake.env))!
    expect(res.status).toBe(204)
    expect(fake.aePoints).toEqual([
      { indexes: ['csp'], blobs: ['csp', 'script-src-elem', 'inline', '/kontakt/'], doubles: [1] },
    ])
  })

  it('records one point per POST, however many reports the batch holds', async () => {
    const fake = makeEnv()
    const one = (blocked: string) => ({
      type: 'csp-violation',
      body: { documentURL: `${ORIGIN}/`, blockedURL: blocked, effectiveDirective: 'script-src-elem' },
    })
    const batch = new Request(url, {
      method: 'POST',
      headers: { 'content-type': 'application/reports+json' },
      body: JSON.stringify([one('inline'), one('https://evil.example/x.js'), one('eval')]),
    })
    expect((await handleCspReport(url, batch, fake.env))!.status).toBe(204)
    expect(fake.aePoints).toEqual([
      { indexes: ['csp'], blobs: ['csp', 'script-src-elem', 'inline', '/'], doubles: [1] },
    ])
  })

  it('answers 204 but records nothing for junk or foreign documents', async () => {
    const fake = makeEnv()
    const junk = new Request(url, { method: 'POST', body: 'not json' })
    expect((await handleCspReport(url, junk, fake.env))!.status).toBe(204)
    expect((await handleCspReport(url, report('https://evil.example/', 'inline'), fake.env))!.status).toBe(204)
    expect(fake.aePoints).toEqual([])
  })

  it('drops an oversized body unread, even without a Content-Length', async () => {
    const fake = makeEnv()
    const valid = JSON.stringify({
      'csp-report': {
        'document-uri': `${ORIGIN}/`,
        'blocked-uri': 'inline',
        'violated-directive': 'script-src-elem',
        pad: 'x'.repeat(70_000),
      },
    })
    const bytes = new TextEncoder().encode(valid)
    // A stream body: the request carries no Content-Length to refuse it by.
    const body = new ReadableStream({ start: (c) => (c.enqueue(bytes), c.close()) })
    const req = new Request(url, { method: 'POST', body, duplex: 'half' } as RequestInit)
    expect((await handleCspReport(url, req, fake.env))!.status).toBe(204)
    expect(fake.aePoints).toEqual([])
  })

  it('drops reports past the per-IP budget', async () => {
    const fake = makeEnv()
    fake.setRateLimit(1)
    const send = (ip: string) => {
      const req = report(`${ORIGIN}/`, 'inline')
      req.headers.set('cf-connecting-ip', ip)
      return handleCspReport(url, req, fake.env)
    }
    expect((await send('203.0.113.9'))!.status).toBe(204)
    expect((await send('203.0.113.9'))!.status).toBe(204)
    expect((await send('203.0.113.10'))!.status).toBe(204)
    expect(fake.aePoints).toHaveLength(2)
  })

  it('budgets a whole IPv6 /64 as one client', async () => {
    const fake = makeEnv()
    fake.setRateLimit(1)
    const send = (ip: string) => {
      const req = report(`${ORIGIN}/`, 'inline')
      req.headers.set('cf-connecting-ip', ip)
      return handleCspReport(url, req, fake.env)
    }
    await send('2001:db8:aa:bb::1')
    await send('2001:db8:aa:bb::2')
    await send('2001:db8:aa:bc::1')
    expect(fake.aePoints).toHaveLength(2)
  })

  it('refuses GET with 405 (the smoke check)', async () => {
    const res = (await handleCspReport(url, new Request(url), makeEnv().env))!
    expect(res.status).toBe(405)
  })
})
