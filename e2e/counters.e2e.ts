import { expect, test } from './fixtures'
import { post } from './posts'
import { reloadWhenIdle } from './helpers'

// The visit beacon and the post view counter (lib/client/visit.ts).
// User-level flows on the built export, desktop and mobile (playwright.config.ts).

test.describe('visit beacon (lib/client/visit.ts)', () => {
  const visits = (page: import('@playwright/test').Page) => {
    const sent: string[] = []
    page.on('request', (r) => {
      if (r.method() === 'POST' && new URL(r.url()).pathname === '/api/visit') sent.push(r.url())
    })
    return sent
  }

  test('waits for a human input, then counts once a day', async ({ page }) => {
    // Playwright's browser reports navigator.webdriver; pose as a person.
    await page.addInitScript(() => Object.defineProperty(Navigator.prototype, 'webdriver', { get: () => false }))
    const sent = visits(page)
    await page.goto('/')
    await page.waitForTimeout(1_000)
    expect(sent, 'nothing on load alone').toHaveLength(0)
    await page.keyboard.press('ArrowDown')
    await expect.poll(() => sent.length).toBe(1)
    // Another page, a reload, more input: the same browser, the same day.
    await page.goto('/blogg/')
    await page.keyboard.press('ArrowDown')
    await reloadWhenIdle(page)
    await page.keyboard.press('ArrowDown')
    await page.waitForTimeout(500)
    expect(sent).toHaveLength(1)
  })

  test('never counts a browser under automation', async ({ page }) => {
    const sent = visits(page)
    await page.goto('/')
    await page.keyboard.press('ArrowDown')
    await page.mouse.move(200, 200)
    await page.waitForTimeout(1_000)
    expect(sent).toHaveLength(0)
  })
})

// The post ViewCounter counts like the beacon: on human input, once per
// session per post, never under automation (lib/client/visit.ts onFirstHumanInput).
test.describe('post view counter', () => {
  const calls = (page: import('@playwright/test').Page) => {
    const methods: string[] = []
    page.on('request', (r) => {
      if (new URL(r.url()).pathname === `/api/views/${post.slug}`) methods.push(r.method())
    })
    return methods
  }

  test('counts on the first human input, then only reads', async ({ page }) => {
    await page.addInitScript(() => Object.defineProperty(Navigator.prototype, 'webdriver', { get: () => false }))
    const methods = calls(page)
    await page.goto(post.path)
    await page.waitForTimeout(1_000)
    expect(methods, 'nothing on load alone').toEqual([])
    await page.keyboard.press('ArrowDown')
    await expect.poll(() => methods).toEqual(['POST'])
    await reloadWhenIdle(page)
    await expect.poll(() => methods).toEqual(['POST', 'GET'])
  })

  test('only reads under automation', async ({ page }) => {
    const methods = calls(page)
    await page.goto(post.path)
    await page.keyboard.press('ArrowDown')
    await page.waitForTimeout(1_000)
    expect(methods).toEqual(['GET'])
  })
})
