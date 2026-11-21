import AxeBuilder from '@axe-core/playwright'
import { expect, test } from './fixtures'
import { STUB_COUNTRIES, hourKey } from './api-stub'

// Front page: sections and the live widgets (status dashboard, Trends, footer).
// User-level flows on the built export, desktop and mobile (playwright.config.ts).

test('front page renders every section and the live widgets', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Rozsoshnykh')
  for (const h of ['Teknologistack', 'Driftsstatus', 'Hvor leserne kommer fra', 'Trafikk over tid']) {
    await expect(page.getByRole('heading', { name: h })).toBeVisible()
  }
  // The code-split widgets load and draw the stubbed /api data.
  await page.locator('#status').scrollIntoViewIfNeeded()
  await expect(page.getByText('Alle systemer operative').first()).toBeVisible()
  // Its live region announces the state only, not the «Oppdatert» time.
  await expect(page.locator('#status').getByRole('status')).toHaveText('Alle systemer operative')
  await page.locator('#besok').scrollIntoViewIfNeeded()
  await expect(page.locator('#besok').getByText('Norge').filter({ visible: true }).first()).toBeVisible()
  // Nothing wider than the screen.
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0)
})

// Each /api/* call is a Worker request against the free plan's daily quota:
// the widgets below the fold (lib/client/use-near-viewport.ts) ask nothing until a
// reader nears them, and the footer dot shares the dashboard's answer.
test('below-the-fold widgets wait for the reader; the status is fetched once', async ({ page }) => {
  const asked: string[] = []
  page.on('request', (r) => {
    const { pathname } = new URL(r.url())
    if (pathname.startsWith('/api/') || pathname === '/world.svg') asked.push(pathname)
  })
  await page.goto('/')
  await page.waitForLoadState('networkidle')
  expect(asked, 'nothing below the fold on load').toEqual([])
  await page.locator('#status').scrollIntoViewIfNeeded()
  await expect(page.getByText('Alle systemer operative').first()).toBeVisible()
  await page.locator('footer').scrollIntoViewIfNeeded()
  await expect(page.locator('footer').getByText('(alle systemer operative)')).toBeAttached()
  expect(asked.filter((p) => p === '/api/status')).toHaveLength(1)
})

test('the dashboard loads and polls only while it is on screen', async ({ page }) => {
  await page.clock.install()
  let calls = 0
  page.on('request', (r) => {
    if (new URL(r.url()).pathname === '/api/status') calls++
  })
  await page.goto('/')
  await page.waitForLoadState('networkidle')
  expect(calls, 'below the fold: not even loaded').toBe(0)
  await page.locator('#status').scrollIntoViewIfNeeded()
  await expect(page.locator('#status').getByText('Alle systemer operative').first()).toBeVisible()
  expect(calls).toBe(1)
  // Scrolled away, past the 90 s refresh: nothing is fetched…
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }))
  await page.waitForTimeout(300) // the observer reports the section gone
  await page.clock.runFor(100_000)
  await page.waitForTimeout(300)
  expect(calls).toBe(1)
  // …until it comes back into view, when the overdue refresh runs at once.
  await page.locator('#status').scrollIntoViewIfNeeded()
  await expect.poll(() => calls).toBe(2)
})

// The caption under an uptime bar is quiet — «Siste N sjekker» — whatever old
// single failures the bar shows: counted out loud, they read as an alarm on a
// service that is up. The count stays for screen readers (the bar is colour
// and mouse-only titles, hidden from them), and while a service is down the
// caption says since when.
test('the uptime caption is quiet, and says since when a service is down', async ({ page }) => {
  const now = Date.now()
  const at = (i: number) => new Date(now - i * 300_000).toISOString()
  // Grafana: one old failed check, up now. NetBox: down for the last two.
  const up = (i: number) => ({ Grafana: i !== 3, NetBox: i > 1 })
  await page.route('**/api/status', (r) =>
    r.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        updatedAt: new Date(now - 60_000).toISOString(),
        results: [
          { name: 'NetBox', ok: false, status: 503, ms: 120 },
          { name: 'Grafana', ok: true, status: 200, ms: 120 },
        ],
        history: [4, 3, 2, 1, 0].map((i) => ({ at: at(i), up: up(i) })),
      }),
    }),
  )
  await page.goto('/')
  const status = page.locator('#status')
  await status.scrollIntoViewIfNeeded()
  const caption = (name: string) =>
    status
      .locator('div.rounded-xl')
      .filter({ hasText: name })
      .locator('span')
      .filter({ hasText: 'Siste 5 sjekker' })
      .first()
  await expect(caption('Grafana')).toBeVisible()
  await expect(caption('Grafana')).not.toContainText('nede siden')
  await expect(caption('Grafana').locator('.sr-only')).toHaveText('· 1 feilet')
  await expect(caption('NetBox')).toContainText('nede siden')
  await expect(caption('NetBox').locator('.sr-only')).toHaveText('· 2 feilet')
  await expect(status.getByText('1:4:9')).toHaveCount(0)
  await expect(status.getByText('ingen feil')).toHaveCount(0)
  await expect(status.locator('[title*="nede"]').first().locator('..')).toHaveAttribute('aria-hidden', 'true')
})

// The Trends card's period switch (components/home/TrendsChart.tsx): buttons
// with aria-pressed, one /api/timeseries request per range
// (lib/client/timeseries.ts), a headline that follows the range. The stub
// answers every range (e2e/api-stub.ts); a test overrides one where it needs.
type TrendsPage = import('@playwright/test').Page
const RANGE_BUTTONS = [
  ['24h', '24t'],
  ['7d', '7d'],
  ['30d', '30d'],
  ['all', 'Alt'],
] as const
const SERIES_URL = (range: string) => `/api/timeseries?metric=geo&range=${range}`

// Answers every range with dots on its own bucket grid (1 h for 24h/7d, 6 h for
// 30d/all: the chart merges by exact bucket key, and the stub's hour keys miss
// a 6 h grid most of the day). `values` are the dots, newest last; `fail`
// turns a range into a 500.
async function routeSeries(page: TrendsPage, values = [1, 2, 3], fail: (range: string) => boolean = () => false) {
  await page.route('**/api/timeseries**', (r) => {
    const range = new URL(r.request().url()).searchParams.get('range') ?? '7d'
    if (fail(range)) {
      return r.fulfill({
        status: 500,
        contentType: 'application/json',
        body: '{"error":{"code":"internal","message":"Boom."}}',
      })
    }
    const step = (range === '30d' || range === 'all' ? 6 : 1) * 3_600_000
    const end = Math.floor(Date.now() / step) * step
    const points = values.map((value, i) => ({ ts: hourKey(end - (values.length - i) * step), value }))
    return r.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ metric: 'geo', range, points }),
    })
  })
}

// The /api/timeseries requests the page makes, as path + query, in order.
function watchSeries(page: TrendsPage) {
  const asked: string[] = []
  page.on('request', (r) => {
    const u = new URL(r.url())
    if (u.pathname === '/api/timeseries') asked.push(u.pathname + u.search)
  })
  return asked
}

// The card, scrolled to (it fetches only once near the viewport).
async function openTrends(page: TrendsPage) {
  await page.goto('/')
  const trends = page.locator('#trender')
  await trends.scrollIntoViewIfNeeded()
  const group = trends.getByRole('group', { name: 'Periode' })
  const button = (label: string) => group.getByRole('button', { name: label, exact: true })
  return {
    trends,
    dots: trends.locator('svg[role="img"] circle'),
    button,
    // The headline: the number and its label share one span.
    headline: (label: string) => trends.getByText(label, { exact: true }).locator('..'),
    async expectPressed(range: string) {
      for (const [id, label] of RANGE_BUTTONS) {
        await expect(button(label)).toHaveAttribute('aria-pressed', String(id === range))
      }
    },
  }
}

test('each period button is pressed alone, asks its range once and relabels the headline', async ({ page }) => {
  const asked = watchSeries(page)
  const card = await openTrends(page)
  await card.expectPressed('7d')
  await expect(card.headline('siste 7d')).toBeVisible()
  await expect(card.dots).toHaveCount(3)
  expect(asked).toEqual([SERIES_URL('7d')])
  for (const [range, label, headline] of [
    ['24h', '24t', 'siste 24t'],
    ['30d', '30d', 'siste 30d'],
    ['all', 'Alt', 'totalt'],
  ]) {
    await card.button(label).click()
    await card.expectPressed(range)
    await expect(card.headline(headline)).toBeVisible()
    await expect.poll(() => asked.filter((q) => q === SERIES_URL(range))).toHaveLength(1)
  }
  expect(asked, 'one request per range, nothing else').toHaveLength(4)
})

// «Alt» is the exact D1 total (the sum of /api/geo, as on the map), «siste 7d»
// the AE count of the window: the stub's AE series differs from the geo sum.
test('«Alt» shows the exact total from /api/geo, a window its own count', async ({ page }) => {
  const total = Object.values(STUB_COUNTRIES).reduce((a, b) => a + b, 0)
  expect(total).toBeGreaterThanOrEqual(100)
  await routeSeries(page, [4, 3])
  const card = await openTrends(page)
  await expect(card.headline('siste 7d')).toHaveText('7 siste 7d')
  await card.button('Alt').click()
  await expect(card.headline('totalt')).toHaveText(`${total} totalt`)
  await expect(card.dots).toHaveCount(2)
})

test('switching back to a period already shown asks nothing new', async ({ page }) => {
  await routeSeries(page)
  const asked = watchSeries(page)
  const card = await openTrends(page)
  await expect(card.dots).toHaveCount(3)
  for (const [range, label] of [
    ['30d', '30d'],
    ['7d', '7d'],
    ['30d', '30d'],
    ['all', 'Alt'],
    ['7d', '7d'],
  ]) {
    await card.button(label).click()
    await card.expectPressed(range)
    // Drawn again from the kept answer: its request, if any, has gone out by now.
    await expect(card.dots).toHaveCount(3)
  }
  expect(asked).toEqual([SERIES_URL('7d'), SERIES_URL('30d'), SERIES_URL('all')])
})

// A failed answer stays inside the card: header and buttons remain, the chart
// says so, and the next switch to that range asks again (the failure isn't kept).
test('a failed series request degrades inside the card, and switching retries it', async ({ page, pageProblems }) => {
  let failing = true
  await routeSeries(page, [1, 2, 3], (range) => failing && range === '30d')
  const asked = watchSeries(page)
  const card = await openTrends(page)
  await expect(card.dots).toHaveCount(3)
  await card.button('30d').click()
  const failed = card.trends.getByText('Kunne ikke laste — bytt periode for å prøve igjen')
  await expect(failed).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Trafikk over tid' })).toBeVisible()
  for (const [, label] of RANGE_BUTTONS) await expect(card.button(label)).toBeVisible()
  await expect(card.dots).toHaveCount(0)
  expect(asked.filter((q) => q === SERIES_URL('30d'))).toHaveLength(1)

  failing = false
  await card.button('7d').click()
  await expect(card.dots).toHaveCount(3)
  await card.button('30d').click()
  await expect(card.dots).toHaveCount(3)
  await expect(failed).toHaveCount(0)
  expect(asked.filter((q) => q === SERIES_URL('30d'))).toHaveLength(2)
  // The browser logs the 500 this test asked for; anything else still fails.
  const i = pageProblems.findIndex((p) => p.includes('status of 500'))
  if (i >= 0) pageProblems.splice(i, 1)
})

// `degraded: true` (AE unreachable) is an empty answer with a 200, not an
// error: the chart says "no visits" / "no data", never the failure message.
test('a degraded answer reads as empty, not as an error', async ({ page }) => {
  await page.route('**/api/timeseries**', (r) =>
    r.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ metric: 'geo', range: '7d', points: [], degraded: true }),
    }),
  )
  const card = await openTrends(page)
  // Visits exist (the stub's geo total), just none in the window.
  await expect(card.trends.getByText('Ingen besøk i denne perioden')).toBeVisible()
  await expect(card.trends.getByText('Kunne ikke laste', { exact: false })).toHaveCount(0)
  await expect(card.dots).toHaveCount(0)
  // No visits at all yet: the dataset itself is empty.
  await page.route('**/api/geo', (r) =>
    r.fulfill({ status: 200, contentType: 'application/json', body: '{"countries":{}}' }),
  )
  await page.goto('/')
  await page.locator('#trender').scrollIntoViewIfNeeded()
  await expect(page.locator('#trender').getByText('Ingen data ennå')).toBeVisible()
  await expect(page.locator('#trender').getByText('Kunne ikke laste', { exact: false })).toHaveCount(0)
})

// A visitor's clock can be days off. The stale banner and the Trends grid
// both hang on "now", so they take it from the answer's Date header
// (lib/client/server-clock.ts): on the local clock a fresh snapshot read as dead and
// the chart's dots fell off its grid.
test("a wrong clock on the visitor's machine greys out nothing", async ({ page }) => {
  const now = Date.now()
  const date = new Date(now).toUTCString()
  const hour = (h: number) => new Date(Math.floor((now - h * 3_600_000) / 3_600_000) * 3_600_000)
  const key = (d: Date) => d.toISOString().slice(0, 19).replace('T', ' ')
  await page.clock.install({ time: now + 2 * 86_400_000 })
  await page.route('**/api/status', (r) =>
    r.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { date },
      body: JSON.stringify({
        updatedAt: new Date(now - 60_000).toISOString(),
        results: [{ name: 'Grafana', ok: true, status: 200, ms: 120 }],
        history: [{ at: new Date(now - 60_000).toISOString(), up: { Grafana: true } }],
      }),
    }),
  )
  await page.route('**/api/timeseries**', (r) =>
    r.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { date },
      body: JSON.stringify({
        metric: 'geo',
        range: '7d',
        points: [5, 2].map((h, i) => ({ ts: key(hour(h)), value: i + 1 })),
      }),
    }),
  )
  await page.goto('/')
  const status = page.locator('#status')
  await status.scrollIntoViewIfNeeded()
  await expect(status.getByText('Alle systemer operative').first()).toBeVisible()
  await expect(status.getByText('Statusdata er utdatert')).toHaveCount(0)
  const trends = page.locator('#trender')
  await trends.scrollIntoViewIfNeeded()
  await expect(trends.locator('svg[role="img"] circle')).toHaveCount(2)
})

// The footer is a phone's last stop. Its links read 16–20 px tall, but the
// finger gets 40 px or more (padding that moves nothing).
test('footer links are finger-sized', async ({ page }) => {
  await page.goto('/')
  const heights = await page
    .locator('footer a')
    .evaluateAll((links) => links.map((a) => Math.round(a.getBoundingClientRect().height)))
  expect(heights.length).toBeGreaterThanOrEqual(6)
  expect(heights.filter((h) => h < 40)).toEqual([])
})

// What visitors see while the site is young: below MIN_PUBLIC_VISITS
// (lib/client/geo.ts) the map and the chart keep their shape but show no number,
// and the chart says why.
test('below the public threshold no visit number shows', async ({ page }) => {
  await page.route('**/api/geo', (r) =>
    r.fulfill({ status: 200, contentType: 'application/json', body: '{"countries":{"NO":11,"US":2,"UA":1,"AM":1}}' }),
  )
  for (const scheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: scheme })
    await page.goto('/')
    await page.locator('#besok').scrollIntoViewIfNeeded()
    await expect(page.locator('#besok').getByText('Norge').filter({ visible: true }).first()).toBeVisible()
    await expect(page.locator('#besok')).not.toContainText(/\d+ besøk/)
    await page.locator('#trender').scrollIntoViewIfNeeded()
    await expect(page.getByText('Samler data — tallene vises fra 100 besøk.')).toBeVisible()
    await page.waitForTimeout(1_000) // fade-ins and hover transitions settle
    const { violations } = await new AxeBuilder({ page }).include('#besok').include('#trender').analyze()
    expect(violations.map((v) => `${scheme} ${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([])
  }
})
