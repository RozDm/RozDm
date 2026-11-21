import { expect, test } from './fixtures'

// Contact form, with and without JavaScript.
// User-level flows on the built export, desktop and mobile (playwright.config.ts).

test.describe('contact form', () => {
  async function fill(page: import('@playwright/test').Page) {
    await page.goto('/kontakt/')
    await page.getByLabel('Navn').fill('Test Person')
    await page.getByLabel('E-post').fill('test@example.com')
    await page.getByLabel('Melding').fill('Hei! Dette er en testmelding.')
    await page.getByRole('button', { name: 'Send melding' }).click()
  }

  // The form and its confirmation replace each other, so whatever had focus
  // is unmounted: focus moves to the confirmation's heading (read out with
  // the line under it), and back to the first field for the next message —
  // it used to fall to <body>, the top of the page.
  test('sends and thanks the visitor, and focus follows what replaced the form', async ({ page }) => {
    await fill(page)
    const thanks = page.getByRole('heading', { name: 'Takk! Meldingen er sendt.' })
    await expect(thanks).toBeFocused()
    await expect(thanks).toHaveAccessibleDescription('Jeg svarer som regel innen en dag eller to.')
    await page.getByRole('button', { name: /Send en til/ }).click()
    await expect(page.getByLabel('Navn')).toBeFocused()
  })

  // The Worker trims before it checks, so a name of spaces or «a» + 9 spaces
  // would pass `required`/`minLength` and come back a 422: the form trims too.
  test('a name or message that is only spaces is refused in the browser, nothing is sent', async ({ page }) => {
    let sent = 0
    await page.route('**/api/contact', (r) => (sent++, r.fulfill({ status: 200, body: '{}' })))
    await page.goto('/kontakt/')
    const name = page.getByLabel('Navn')
    const message = page.getByLabel('Melding')
    await page.getByLabel('E-post').fill('test@example.com')
    const send = page.getByRole('button', { name: 'Send melding' })

    await name.fill('   ')
    await message.fill('Hei! Dette er en testmelding.')
    await send.click()
    await expect
      .poll(() => name.evaluate((el: HTMLInputElement) => el.validationMessage))
      .toBe('Skriv inn navnet ditt.')
    await expect(name).toBeFocused()

    await name.fill('Test Person')
    await message.fill('a' + ' '.repeat(9))
    await send.click()
    await expect
      .poll(() => message.evaluate((el: HTMLTextAreaElement) => el.validationMessage))
      .toBe('Meldingen må være minst 10 tegn.')
    await expect(message).toBeFocused()
    expect(sent).toBe(0)

    // The error clears as the visitor types, and a trimmed message goes through.
    await message.fill('  Hei! Dette er en testmelding.  ')
    await send.click()
    await expect(page.getByRole('heading', { name: 'Takk! Meldingen er sendt.' })).toBeVisible()
    expect(sent).toBe(1)
  })

  test('says so on a rate limit and keeps the typed text', async ({ page, pageProblems }) => {
    await page.route('**/api/contact', (r) =>
      r.fulfill({ status: 429, body: '{"error":{"code":"rate_limited","message":"Too many requests."}}' }),
    )
    await fill(page)
    await expect(page.getByText(/For mange meldinger på kort tid/)).toBeVisible()
    await expect(page.getByLabel('Melding')).toHaveValue('Hei! Dette er en testmelding.')
    // The browser logs the 429 this test asked for; anything else still fails.
    const i = pageProblems.findIndex((p) => p.includes('status of 429'))
    if (i >= 0) pageProblems.splice(i, 1)
  })

  test('a filter refusal points to e-mail, not to a challenge', async ({ page, pageProblems }) => {
    await page.route('**/api/contact', (r) =>
      r.fulfill({
        status: 403,
        body: '{"error":{"code":"forbidden","message":"Only the site itself may send this."}}',
      }),
    )
    await fill(page)
    // Filtered by text: Next's route announcer is an alert too.
    const alert = page.getByRole('alert').filter({ hasText: 'stanset av sikkerhetsfiltrene' })
    await expect(alert).toBeVisible()
    await expect(alert.getByRole('link', { name: 'contact@rozsoshnykh.no' })).toBeVisible()
    const i = pageProblems.findIndex((p) => p.includes('status of 403'))
    if (i >= 0) pageProblems.splice(i, 1)
  })

  // The widget tests need an export built with a site key (ci.yml sets
  // Cloudflare's test key; e2e/fixtures.ts stands in for its api.js). A local
  // build without one renders no widget: they skip there, never in CI.
  const widgetOrSkip = (asked: number) => {
    test.skip(asked === 0 && !process.env.CI, 'export built without NEXT_PUBLIC_TURNSTILE_SITE_KEY')
    expect(asked, 'the CI export renders the Turnstile widget (ci.yml site key)').toBeGreaterThan(0)
  }

  test('a blocked security check points to e-mail, also after coming back', async ({ page, pageProblems }) => {
    let asked = 0
    await page.route(
      (url) => url.hostname === 'challenges.cloudflare.com',
      (r) => (asked++, r.abort()),
    )
    await page.goto('/kontakt/')
    await page.waitForLoadState('networkidle')
    widgetOrSkip(asked)
    const notice = page.getByRole('alert').filter({ hasText: 'Sikkerhetssjekken lastet ikke' })
    await expect(notice).toBeVisible()
    await expect(notice.getByRole('link', { name: 'contact@rozsoshnykh.no' })).toBeVisible()
    // Back to the form by client-side navigation: the loader tries again and
    // says so again (it used to wait forever on the dead <script>).
    await page.getByRole('link', { name: /Tilbake til forsiden/ }).click()
    await expect(page).toHaveURL(/\/\/[^/]+\/$/)
    await page.goBack()
    await expect(page).toHaveURL(/\/kontakt\/$/)
    await expect(notice).toBeVisible()
    await page.getByLabel('Navn').fill('Test Person')
    await page.getByLabel('E-post').fill('test@example.com')
    await page.getByLabel('Melding').fill('Hei! Dette er en testmelding.')
    await page.getByRole('button', { name: 'Send melding' }).click()
    // Still the e-mail notice, never a challenge with no widget to solve.
    await expect(notice).toBeVisible()
    await expect(page.getByRole('alert').filter({ hasText: 'Bekreft at du ikke er en bot' })).toHaveCount(0)
    // The browser logs each refused script load; anything else still fails.
    for (let i = pageProblems.length - 1; i >= 0; i--) {
      if (/Failed to load resource/.test(pageProblems[i])) pageProblems.splice(i, 1)
    }
  })

  test('the security check follows the site’s theme toggle', async ({ page }) => {
    let asked = 0
    page.on('request', (r) => {
      if (new URL(r.url()).hostname === 'challenges.cloudflare.com') asked++
    })
    await page.emulateMedia({ colorScheme: 'light' })
    await page.goto('/kontakt/')
    await page.waitForLoadState('networkidle')
    widgetOrSkip(asked)
    const widget = page.locator('[data-fake-turnstile]')
    await expect(widget).toHaveAttribute('data-fake-turnstile', 'light')
    await page.getByRole('button', { name: 'Bytt til mørkt tema' }).click()
    await expect(widget).toHaveAttribute('data-fake-turnstile', 'dark')
  })
})

// The form is a fetch() behind a Turnstile check: without JavaScript it can't
// send, and a native submit would be a GET with the message in the address
// bar. The page says so and gives the address, hides the fields that would
// lead nowhere, and the form's method keeps a message out of any URL.
test.describe('contact form without JavaScript', () => {
  test.use({ javaScriptEnabled: false })

  test('points to e-mail instead of offering a dead form', async ({ page }) => {
    await page.goto('/kontakt/')
    const form = page.locator('main form')
    // By its element, not getByText: Playwright's text matching never looks
    // inside a <noscript>.
    const note = form.locator('noscript p')
    await expect(note).toBeVisible()
    await expect(note).toContainText('Skjemaet trenger JavaScript')
    await expect(form.getByRole('link', { name: 'contact@rozsoshnykh.no' })).toHaveAttribute(
      'href',
      'mailto:contact@rozsoshnykh.no',
    )
    await expect(form).toHaveAttribute('method', 'post')
    await expect(form.getByLabel('Navn')).toBeHidden()
    await expect(form.getByRole('button', { name: 'Send melding' })).toBeHidden()
  })
})

test('the contact page’s footer doesn’t invite to the contact page', async ({ page }) => {
  await page.goto('/kontakt/')
  const footer = page.locator('footer')
  await expect(footer.getByText('GitHub')).toBeVisible()
  await expect(footer.getByRole('heading')).toHaveCount(0)
  await expect(footer.getByRole('link', { name: 'Kontaktskjema' })).toHaveCount(0)
})
