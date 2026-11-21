import { expect, test } from './fixtures'
import { endsWith, post, tagPage, twin } from './posts'
import { reloadWhenIdle } from './helpers'

// Site-wide chrome: theme, language switch, navigation, 404, privacy footer, noindex.
// User-level flows on the built export, desktop and mobile (playwright.config.ts).

test('theme toggle switches and remembers the theme', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' })
  await page.goto('/')
  const html = page.locator('html')
  await expect(html).not.toHaveClass(/\bdark\b/)
  await page.getByRole('button', { name: 'Bytt til mørkt tema' }).click()
  await expect(html).toHaveClass(/\bdark\b/)
  await reloadWhenIdle(page)
  await expect(html).toHaveClass(/\bdark\b/)
})

test('flipping back to the OS theme follows the OS again, live', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' })
  await page.goto('/')
  const html = page.locator('html')
  await page.getByRole('button', { name: 'Bytt til mørkt tema' }).click()
  await expect(html).toHaveClass(/\bdark\b/)
  // Picked by hand: an OS switch doesn't override it.
  await page.emulateMedia({ colorScheme: 'dark' })
  await page.emulateMedia({ colorScheme: 'light' })
  await expect(html).toHaveClass(/\bdark\b/)
  // Back to the OS's own theme: nothing stored, and the OS leads again.
  await page.getByRole('button', { name: 'Bytt til lyst tema' }).click()
  await expect(html).not.toHaveClass(/\bdark\b/)
  expect(await page.evaluate(() => localStorage.getItem('theme'))).toBeNull()
  await page.emulateMedia({ colorScheme: 'dark' })
  await expect(html).toHaveClass(/\bdark\b/)
})

test('NO/EN switch moves between the language twins', async ({ page }) => {
  test.skip(!twin, 'no published post has an English twin')
  await page.goto(twin!.nb)
  await page.getByRole('link', { name: /^EN/ }).click()
  await expect(page).toHaveURL(endsWith(twin!.en))
  await expect(page.locator('html')).toHaveAttribute('lang', 'en')
  await page.getByRole('link', { name: /^NO/ }).click()
  await expect(page).toHaveURL(endsWith(twin!.nb))
  await expect(page.locator('html')).toHaveAttribute('lang', 'nb')
})

test('header nav scrolls within the front page (desktop)', async ({ page, isMobile }) => {
  test.skip(isMobile, 'the mobile menu has its own test')
  await page.goto('/')
  await page.getByRole('navigation').getByRole('link', { name: 'Kompetanse', exact: true }).click()
  await expect(page).toHaveURL(/\/#skills$/) // one hash, not /#main#skills
  await expect(page.locator('#skills')).toBeInViewport()
})

test('logo lines up with the content (desktop)', async ({ page, isMobile }) => {
  test.skip(isMobile, 'one column on phones')
  await page.goto('/')
  const logo = await page.locator('header a').first().boundingBox()
  const h1 = await page.getByRole('heading', { level: 1 }).boundingBox()
  expect(Math.round(logo!.x)).toBe(Math.round(h1!.x))
})

test('mobile menu opens, closes on Escape and navigates', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'desktop shows the nav inline')
  await page.goto('/')
  const toggle = page.getByRole('button', { name: 'Åpne meny' })
  await toggle.click()
  const menu = page.getByRole('navigation', { name: 'Mobilnavigasjon' })
  await expect(menu).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(menu).toHaveCount(0)
  await expect(toggle).toBeFocused()
  await toggle.click()
  await page.getByRole('navigation', { name: 'Mobilnavigasjon' }).getByRole('link', { name: 'Blogg' }).click()
  await expect(page).toHaveURL(/\/blogg\/$/)
})

// WebKit's Tab skips links (Safari's default), so these run on Chromium.
test('mobile menu closes when Tab leaves it', async ({ page, isMobile, browserName }) => {
  test.skip(!isMobile || browserName === 'webkit', 'Chromium phone only')
  await page.goto('/blogg/')
  await page.getByRole('button', { name: 'Åpne meny' }).click()
  const menu = page.getByRole('navigation', { name: 'Mobilnavigasjon' })
  await menu.getByRole('link').last().focus()
  await page.keyboard.press('Tab')
  await expect(menu).toHaveCount(0)
})

test('every page starts with a skip link to its main content', async ({ page, browserName }) => {
  test.skip(browserName === 'webkit', "WebKit's Tab skips links")
  for (const path of ['/', '/kontakt/', post.path, '/en/privacy/']) {
    await page.goto(path)
    await page.keyboard.press('Tab')
    const skip = page.getByRole('link', { name: /Hopp til hovedinnhold|Skip to main content/ })
    await expect(skip).toBeFocused()
    await expect(skip).toHaveAttribute('href', '#main')
    await expect(page.locator('main#main')).toHaveCount(1)
  }
})

// Pre-launch (app/CLAUDE.md, SEO): no page may be indexed until the owner says
// "launch" — this test flips together with robots.index in app/layout.tsx
// and the home check in scripts/smoke.sh (all three, or CI or the deploy fails).
test('pre-launch: every page tells search engines noindex', async ({ page, request, isMobile }) => {
  test.skip(isMobile, 'markup, not layout')
  const xml = await (await request.get('/sitemap.xml')).text()
  const paths = [...xml.matchAll(/<loc>https:\/\/rozsoshnykh\.no([^<]*)<\/loc>/g)].map((m) => m[1])
  expect(paths.length).toBeGreaterThan(0)
  for (const path of [...paths, '/kontakt/', '/personvern/', tagPage]) {
    await page.goto(path)
    const robots = await page
      .locator('meta[name="robots"]')
      .evaluateAll((els) => els.map((e) => e.getAttribute('content')))
    expect(robots.length, path).toBeGreaterThan(0)
    for (const r of robots) expect(r, path).toMatch(/noindex/)
  }
})

test('404 page: HAL, a 404 status and the body font', async ({ page }) => {
  const res = await page.goto('/finnes-ikke/')
  expect(res?.status()).toBe(404)
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Beklager %username%')
  // finalize-export.mjs adds the font preload Next leaves off the 404 —
  // without it, display: 'optional' renders the page in the system monospace.
  await expect(page.locator('link[rel="preload"][as="font"]')).toHaveCount(1)
  await page.evaluate(() => document.fonts.ready)
  // Its family is named after lib/server/fonts.ts's const (intelOneMono), hashed or not.
  expect(
    await page.evaluate(() => [...document.fonts].some((f) => /intel/i.test(f.family) && f.status === 'loaded')),
  ).toBe(true)
  await expect(page).toHaveTitle(/^404 – /)
  await page.getByRole('link', { name: 'Tilbake til forsiden' }).click()
  // The home URL itself: /\/$/ also matched the 404's own /finnes-ikke/.
  await expect(page).toHaveURL(/\/\/[^/]+\/$/)
})

test('404 under /en/ speaks English', async ({ page }) => {
  const res = await page.goto('/en/finnes-ikke/')
  expect(res?.status()).toBe(404)
  await expect(page.locator('html')).toHaveAttribute('lang', 'en')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(/^I’m sorry %username%/)
  await page.getByRole('link', { name: 'Back to the home page' }).click()
  await expect(page).toHaveURL(/\/en\/$/)
})

test('the privacy pages’ footer doesn’t link to itself', async ({ page }) => {
  for (const [path, name] of [
    ['/personvern/', 'Personvern'],
    ['/en/privacy/', 'Privacy'],
  ]) {
    await page.goto(path)
    const footer = page.locator('footer')
    await expect(footer.getByText('GitHub')).toBeVisible()
    await expect(footer.getByRole('link', { name })).toHaveCount(0)
  }
  await page.goto('/kontakt/')
  await expect(page.locator('footer').getByRole('link', { name: 'Personvern' })).toHaveCount(1)
})
