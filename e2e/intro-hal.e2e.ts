import AxeBuilder from '@axe-core/playwright'
import { expect, test } from './fixtures'
import { reloadWhenIdle } from './helpers'

// First-visit intro and the HAL overlays (axe).
// User-level flows on the built export, desktop and mobile (playwright.config.ts).

test.describe('first visit', () => {
  test.use({ introSeen: false })

  test('plays the intro once; any key skips it', async ({ page }) => {
    await page.goto('/')
    const greeting = page.getByText('HEI %USERNAME%')
    // Fading in (phase 1 began), not merely in the DOM: Playwright calls an
    // opacity-0 node visible, and a key pressed before the intro's keydown
    // listener is attached is lost (seen under load in WebKit). Phase 1's
    // timer is set in the same effect flush that attaches the listener.
    const card = greeting.locator('..')
    await expect.poll(() => card.evaluate((el) => Number(getComputedStyle(el).opacity))).toBeGreaterThan(0)
    await page.keyboard.press('Space')
    await expect(greeting).toHaveCount(0, { timeout: 5_000 })
    expect(await page.evaluate(() => localStorage.getItem('intro-seen'))).toBe('1')
    await reloadWhenIdle(page)
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    await expect(page.getByText('HEI %USERNAME%')).toHaveCount(0)
  })

  // Skipping mid-sequence: the phase-2 timer (3000ms) fires inside the 1400ms
  // fade-out and must not pull the overlay back to opaque.
  test('a skip between phase timers stays skipped', async ({ page }) => {
    await page.clock.install()
    await page.goto('/')
    const overlay = page.getByRole('dialog')
    await expect(overlay).toBeVisible()
    await page.clock.runFor(2_500)
    await page.keyboard.press('Space')
    await page.clock.runFor(700)
    await expect(overlay).toHaveClass(/opacity-0/)
    await expect(overlay).toHaveClass(/pointer-events-none/)
    await page.clock.runFor(1_500)
    await expect(overlay).toHaveCount(0)
  })
})

// The intro and HAL's idle screen cover the page and sit outside every
// landmark: axe's `region` rule once flagged the greeting card and the skip
// hint. The intro is a labelled dialog now, HAL's screen is aria-hidden. The
// scans skip color-contrast: both fade, and mid-fade colours are not the point.
async function overlayViolations(page: import('@playwright/test').Page, label: string) {
  const { violations } = await new AxeBuilder({ page }).disableRules(['color-contrast']).analyze()
  return violations.map((v) => `${label} ${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)
}

test.describe('overlays and axe', () => {
  for (const scheme of ['light', 'dark'] as const) {
    test.describe(`first visit (${scheme})`, () => {
      test.use({ introSeen: false })

      test('the intro has no axe violations and reads as a dialog', async ({ page }) => {
        await page.emulateMedia({ colorScheme: scheme })
        for (const path of ['/', '/en/']) {
          await page.goto(path)
          const dialog = page.getByRole('dialog')
          await expect(dialog).toBeVisible()
          // The skip hint is the dialog's description: it carries meaning.
          await expect(dialog).toHaveAccessibleDescription(/\S/)
          await expect(dialog).toHaveAccessibleName(/\S/)
          // Past the greeting, with the skip hint showing.
          const hint = page.locator('#intro-skip')
          await expect.poll(() => hint.evaluate((el) => Number(getComputedStyle(el).opacity))).toBe(1)
          expect(await overlayViolations(page, path)).toEqual([])
        }
      })
    })

    test(`HAL's idle screen has no axe violations (${scheme})`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme })
      // A fake clock instead of waiting out the 75 s idle timer.
      await page.clock.install()
      for (const path of ['/', '/en/']) {
        await page.goto(path)
        const hal = page.locator('[role="presentation"].fixed')
        // The lazy chunk mounts (and arms the timer) after hydration, so keep
        // winding the clock until HAL wakes.
        await expect
          .poll(
            async () => {
              await page.clock.runFor(5_000)
              return hal.count()
            },
            { intervals: [200], timeout: 20_000 },
          )
          .toBe(1)
        expect(await overlayViolations(page, path)).toEqual([])
      }
    })
  }
})
