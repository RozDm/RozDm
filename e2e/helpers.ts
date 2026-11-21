// Helpers shared by more than one e2e file.

// Reload once the network is quiet: WebKit fails a reload that cancels
// in-flight requests (Next's viewport prefetches) with "WebKit encountered an
// internal error" — the reload itself, not the page under test.
export async function reloadWhenIdle(page: import('@playwright/test').Page) {
  await page.waitForLoadState('networkidle')
  await page.reload()
}
