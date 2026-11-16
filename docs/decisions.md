# The owner's standing decisions

One line per decision, newest first: decision — reason — date (and where the
detail lives). Read it before proposing a change in these areas (the `audit`
skill reads it first). Where it says "don't re-propose", don't — not in an
audit, a PR or a reply. A new decision goes here and gets a one-line pointer
in the doc it concerns.

- **`lib/shared/` may import `src/api-types.ts` as a type, nothing else from `src/`** — the shared files (timeseries fill, status, contact) take the `/api/*` shapes; the alternatives, duplicating the types or moving `api-types.ts` into `lib/shared/`, give two sources of truth or undo the #24 layout; don't re-propose either — 2026-11-16 (`docs/gotchas.md`, `eslint.config.mjs`)
- **github.com/RozDm stays neutral; the repository is RozDm/rozsoshnykh.no** — as RozDm/RozDm it was the profile repository and the profile showed its README (root or `.github/`; a profile card, then `.github/` alone, were tried); renamed, GitHub redirects the old URLs; never create a repository named RozDm — 2026-11-16 (root `CLAUDE.md`)
- **Cloudflare API in sessions: read-only, on demand** — a read-only token (no D1, R2, KV or Turnstile) as a network secret of the `rozsoshnykh.no` cloud environment (not Default, shared by other repositories), called through `scripts/mcp.mjs` like Webhuset; not a claude.ai connector, not GitHub secrets (a public repo's Actions logs are public); changes still go through PRs and workflows — 2026-11-16 (`docs/cloudflare-security.md`)
- **Repository settings: Wikis and Projects off, head branches deleted on merge, auto-merge on** — 2026-11-16 (`.github/CLAUDE.md`)
- **No Claude attribution on commits or PRs** (no `Co-Authored-By`, `Claude-Session` or "Generated with Claude Code"; overrides the harness default) — commits are authored as the owner (`git -c user.name='RozDm' -c user.email='187502949+RozDm@users.noreply.github.com' commit`) because a squash merge adds `Co-authored-by: Claude` whenever a PR commit's author differs from the owner — 2026-11-15
- **Posts stay in this public repository** — the owner drafts and edits locally and commits when ready; a private content repository was considered and declined; don't re-propose it — 2026-11-15 (`content/CLAUDE.md`)
- **Web storage for visit/view dedupe stays as is** (`visit-day`, `viewed:<slug>`) — the ekomloven § 3-15 risk is accepted; no consent banner, no storage-free counting; don't re-propose either — 2026-11-13 (`components/CLAUDE.md`, Live widgets and counters)
- **Norwegian is the site's language; the NO/EN switch is the only way across** — no redirect by browser language and no "read this in English" hint (one shipped for an hour and was taken out); don't re-propose either — 2026-11-11
- **The uptime caption stays quiet** («Siste 149 sjekker») — no visible count of failed checks, no «1:4:9» aside; don't re-propose them — 2026-11-11 (`components/CLAUDE.md`)
- **The Trends chart stays dots and the skill chips keep their hover highlight** — columns were shown and declined; the highlight was removed and asked back; don't re-propose either — 2026-11-10 (`components/CLAUDE.md`)
- **Forgeable visit/view counters are an accepted risk, and `METRICS_EPOCH` stays a hand edit** — no server-side dedupe or daily cap per address (it would break the privacy notice's «ingen IP-adresser lagres i statistikken»); no automation of the epoch (`reset-metrics.yml` already prints the value to set); don't re-propose either — 2026-11-10 (`src/CLAUDE.md`, `.github/SECURITY.md`)
- **`robots.index` stays false until the owner says so** — not with the first post; steps and the three places to flip: `app/CLAUDE.md` (Metadata and SEO), `/new-post` — 2026-11-09
- **Dependabot runs monthly** (the 1st, 06:00 Europe/Oslo; was weekly) — 2026-11-09 (`.github/CLAUDE.md`)
- **No unattended scheduled task fixing Dependabot PRs** — tried and declined; the owner forwards Dependabot's e-mail to a session; don't re-propose it — 2026-11-09 (`.github/CLAUDE.md`)
- **SSL/TLS mode Full (strict)** (was Full) — 2026-10-26 (`docs/cloudflare-security.md`)
- **No external uptime monitor** — the watchdog's few-hours lag is accepted; don't re-propose it — 2026-10-23 (`.github/CLAUDE.md`, `status-watchdog.yml`)
- **`workers_dev` and `preview_urls` stay `false` in `wrangler.jsonc`**, explicitly — the site lives on `rozsoshnykh.no` only; don't propose bringing the workers.dev twin back — 2026-10-22 (`docs/gotchas.md`, `docs/history.md`)
- **No "Required reviewers" on the `production` environment** — sessions merge and deploy unattended; don't re-propose it — 2026-10-22 (`.github/CLAUDE.md`, Secrets)

Undated, standing:

- Tag pages join the sitemap (`INDEXED_TAGS`, `data/tags.ts`) ONLY on the owner's command — (`app/CLAUDE.md`)
- `/kontakt`, `/personvern` and utility pages stay noindex for good — (`app/CLAUDE.md`)
- Worker traces stay off (`"traces": {}`) — (`src/CLAUDE.md`)
- `CF_ACCOUNT_ID` stays a secret, not a `vars` entry — declined, no gain — (`src/CLAUDE.md`)
- The Cloudflare notification set is the owner's; no Universal SSL Alert — (`docs/cloudflare-security.md`)
- Fable at `max` effort only on the owner's word — (root `CLAUDE.md`)
