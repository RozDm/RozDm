import AxeBuilder from '@axe-core/playwright'
import { expect, test } from './fixtures'
import { endsWith, post, tagPage } from './posts'

// Blog: index, post, tag page, layout, code blocks, RSS, axe. Tests take their post from the build (e2e/posts.ts), never by name.
// User-level flows on the built export, desktop and mobile (playwright.config.ts).

test('blog: index → post → tag page and back', async ({ page }) => {
  await page.goto('/blogg/')
  await page.getByRole('link', { name: post.title, exact: true }).first().click()
  await expect(page).toHaveURL(endsWith(post.path))
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(post.title)
  await page.locator(`main a[href="${tagPage}"]`).first().click()
  await expect(page).toHaveURL(endsWith(tagPage))
  await page.goto(post.path)
  await page.getByRole('link', { name: /Tilbake til bloggen/ }).click()
  await expect(page).toHaveURL(/\/blogg\/$/)
})

test('a post fits the screen, and inline code breaks between words only', async ({ page }) => {
  await page.goto(post.path)
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0)
  // No table wider than the text column (a clipped table hides its overflow).
  const wideTables = await page.locator('.post-body table').evaluateAll((tables) => {
    const column = document.querySelector('.post-body')!.getBoundingClientRect().width
    return tables.map((t) => Math.round(t.getBoundingClientRect().width)).filter((w) => w > column + 1)
  })
  expect(wideTables).toEqual([])
  // lib/server/inline-code.ts: each word is one .code-word span, so none spans two lines.
  const split = await page
    .locator('.post-body .code-word')
    .evaluateAll((els) => els.filter((el) => el.getClientRects().length > 1).map((el) => el.textContent))
  expect(split).toEqual([])
})

// Post tables (app/globals.css): a cell hyphenates before it breaks a word
// just anywhere, and on a phone a table of up to three columns keeps every
// column readable — auto layout once left the label column 7 characters and
// «Internett» broke as «Interne/tt». A table is planted in the post's own
// .post-body, so the check needs no post with one.
test('post tables hyphenate, and a phone keeps every column readable', async ({ page }) => {
  await page.goto(post.path)
  const table = await page.locator('.post-body').evaluate((body) => {
    const planted = document.createElement('table')
    planted.id = 'planted-table'
    planted.innerHTML =
      '<thead><tr><th>Lag</th><th>Spørsmålet</th><th>Typiske feil</th></tr></thead><tbody>' +
      '<tr><td>5 Applikasjon</td><td>Svarer tjenesten riktig?</td><td>DNS, TLS, HTTP og <code>curl -v</code></td></tr>' +
      '<tr><td>3 Internett (IP)</td><td>Finnes det en vei dit?</td><td>Adresse, nettmaske, gateway, ruting</td></tr></tbody>'
    body.append(planted)
    return {
      wider: planted.getBoundingClientRect().width - body.getBoundingClientRect().width,
      code: getComputedStyle(planted.querySelector('code')!).hyphens,
      cells: [...planted.querySelectorAll('th, td')].map((cell) => {
        const style = getComputedStyle(cell)
        return {
          hyphens: style.hyphens,
          floor: parseFloat(style.minWidth) || 0,
          width: cell.getBoundingClientRect().width,
        }
      }),
    }
  })
  expect(new Set(table.cells.map((c) => c.hyphens))).toEqual(new Set(['auto']))
  // Code keeps its characters: no hyphen that isn't in the command.
  expect(table.code).toBe('manual')
  expect(table.wider).toBeLessThanOrEqual(1)
  const phone = page.viewportSize()!.width < 640
  for (const cell of table.cells) {
    // The floor is the phone's; a desktop column is as wide as its text needs.
    if (phone) expect(cell.floor).toBeGreaterThan(60)
    else expect(cell.floor).toBe(0)
    expect(cell.width).toBeGreaterThanOrEqual(cell.floor - 0.5)
  }
})

for (const scheme of ['light', 'dark'] as const) {
  test(`no axe violations (${scheme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme })
    for (const path of ['/', '/en/', post.path, '/kontakt/', '/personvern/', '/finnes-ikke/']) {
      await page.goto(path)
      // Let the lazy widgets and fade-ins settle before scanning contrast.
      await page.evaluate(async () => {
        for (let y = 0; y < document.body.scrollHeight; y += 600) {
          window.scrollTo({ top: y, behavior: 'instant' })
          await new Promise((r) => setTimeout(r, 100))
        }
      })
      await page.waitForTimeout(1_000)
      const { violations } = await new AxeBuilder({ page }).analyze()
      expect(violations.map((v) => `${path} ${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([])
    }
  })
}

// Code blocks: rehype-highlight's token colours (app/globals.css) on the
// block PostPage gives `pre`. Blocks marked up as PostPage renders them are
// planted in a copy of the post's prose wrapper (same classes), so the check
// needs no post with code, and axe checks their contrast — the light theme
// once drew dark text on a dark block.
for (const scheme of ['light', 'dark'] as const) {
  test(`code blocks are readable (${scheme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme })
    await page.goto(post.path)
    await page.waitForLoadState('networkidle')
    await page.locator('.prose').evaluate((prose) => {
      const copy = prose.cloneNode(false) as HTMLElement
      copy.id = 'planted-code'
      copy.innerHTML =
        '<pre tabindex="0"><code class="hljs language-bash"><span class="hljs-comment"># restart</span>\n' +
        '<span class="hljs-keyword">for</span> h <span class="hljs-keyword">in</span> web01; <span class="hljs-keyword">do</span> ' +
        'ssh <span class="hljs-string">"$h"</span> <span class="hljs-built_in">echo</span> <span class="hljs-variable">$?</span> ' +
        '<span class="hljs-number">42</span> <span class="hljs-title">main</span> <span class="hljs-attr">key</span>; ' +
        '<span class="hljs-keyword">done</span></code></pre><pre tabindex="0"><code>plain block, no language</code></pre>'
      prose.after(copy)
    })
    const { violations } = await new AxeBuilder({ page })
      .include('#planted-code')
      .withRules(['color-contrast'])
      .analyze()
    expect(violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([])
  })
}

// The feed was a <link rel="alternate"> only: nothing a reader could see.
test('the blog index links its RSS feed, in both languages', async ({ page, request }) => {
  for (const [index, feed] of [
    ['/blogg/', '/feed.xml'],
    ['/en/blog/', '/en/feed.xml'],
  ]) {
    await page.goto(index)
    const link = page.locator('main a[type="application/rss+xml"]')
    await expect(link).toBeVisible()
    await expect(link).toHaveAttribute('href', feed)
    expect(await (await request.get(feed)).text()).toContain('<rss')
  }
})
