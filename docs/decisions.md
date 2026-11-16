# The owner's standing decisions

One registry of what the owner has decided, newest first. Read it before
proposing a change in these areas (the `audit` skill reads it first). Where
it says "don't re-propose", don't — not in an audit, a PR or a reply. The
detail lives in the doc named after each entry; a new decision goes here and
gets a one-line pointer there.

- **2026-11-16 — github.com/RozDm stays neutral; the project README is
  `.github/README.md`**: RozDm/RozDm is the GitHub profile repository, so a
  README in its root becomes the profile page. None there: the profile is
  GitHub's default (pinned repositories, activity). A short profile card
  shipped first and was taken out the same day (owner's call). The
  repository page shows `.github/README.md`. Renaming the repository was
  declined (it breaks the RozDm/RozDm links in `security.txt`, `SECURITY.md`
  and the session setup). (root `CLAUDE.md`)
- **2026-11-16 — Cloudflare API in sessions: read-only, on demand**: a
  read-only token (no D1, R2, KV or Turnstile) as a network secret of the
  `RozDm` cloud environment (not Default, shared by the owner's other
  repositories), called through `scripts/mcp.mjs` like Webhuset — not a
  claude.ai connector, not GitHub secrets (Actions logs of a public repo are
  public). Changes keep going through PRs and the workflows.
  (`docs/cloudflare-security.md`)
- **2026-11-16 — Repository settings**: Wikis and Projects off, head
  branches deleted on merge, auto-merge on. (`.github/CLAUDE.md`)
- **2026-11-15 — No Claude attribution on commits or PRs**: no
  `Co-Authored-By`, no `Claude-Session`, no "Generated with Claude Code"
  line. Overrides the harness default. Commits are authored as the owner
  (`git -c user.name='RozDm' -c user.email='187502949+RozDm@users.noreply.github.com'
  commit`): a squash merge adds `Co-authored-by: Claude` whenever a PR
  commit's author differs from the owner.
- **2026-11-15 — Posts stay in this public repository**: the owner drafts
  and edits them locally and commits when ready. A private content
  repository was considered and declined. Don't re-propose it.
  (`content/CLAUDE.md`)
- **2026-11-13 — Web storage for visit/view dedupe stays as is**
  (`visit-day`, `viewed:<slug>`): the ekomloven § 3-15 risk is accepted; no
  consent banner, no storage-free counting. Don't re-propose either.
  (`components/CLAUDE.md`, Live widgets and counters)
- **2026-11-11 — Norwegian is the site's language; the NO/EN switch is the
  only way across.** No redirect by browser language and no "read this in
  English" hint — one shipped for an hour and was taken out. Don't
  re-propose either.
- **2026-11-11 — The uptime caption stays quiet** («Siste 149 sjekker»): no
  visible count of failed checks, no «1:4:9» aside. Don't re-propose them.
  (`components/CLAUDE.md`)
- **2026-11-10 — The Trends chart stays dots and the skill chips keep their
  hover highlight**: columns were shown and declined; the highlight was
  removed and asked back. Don't re-propose either. (`components/CLAUDE.md`)
- **2026-11-10 — Forgeable visit/view counters are an accepted risk, and
  `METRICS_EPOCH` stays a hand edit.** No server-side dedupe or daily cap
  per address (it would break the privacy notice's «ingen IP-adresser lagres
  i statistikken»); no automation of the epoch (`reset-metrics.yml` already
  prints the value to set). Don't re-propose either. (`src/CLAUDE.md`,
  `.github/SECURITY.md`)
- **2026-11-09 — `robots.index` stays false until the owner says so** — not
  with the first post. Steps and the three places to flip: `app/CLAUDE.md`
  (Metadata and SEO), `/new-post`.
- **2026-11-09 — Dependabot runs monthly** (the 1st, 06:00 Europe/Oslo; was
  weekly). (`.github/CLAUDE.md`)
- **2026-11-09 — No unattended scheduled task fixing Dependabot PRs**: tried
  and declined; the owner forwards Dependabot's e-mail to a session. Don't
  re-propose it. (`.github/CLAUDE.md`)
- **2026-10-26 — SSL/TLS mode Full (strict)** (was Full).
  (`docs/cloudflare-security.md`)
- **2026-10-23 — No external uptime monitor**: the watchdog's few-hours lag
  is accepted. Don't re-propose it. (`.github/CLAUDE.md`, `status-watchdog.yml`)
- **2026-10-22 — `workers_dev` and `preview_urls` stay `false` in
  `wrangler.jsonc`**, explicitly: the site lives on `rozsoshnykh.no` only.
  Don't propose bringing the workers.dev twin back. (`docs/gotchas.md`,
  `docs/history.md`)
- **2026-10-22 — No "Required reviewers" on the `production` environment**:
  sessions merge and deploy unattended. Don't re-propose it.
  (`.github/CLAUDE.md`, Secrets)

Undated, standing:
- Tag pages join the sitemap (`INDEXED_TAGS`, `data/tags.ts`) ONLY on the
  owner's command. (`app/CLAUDE.md`)
- `/kontakt`, `/personvern` and utility pages stay noindex for good.
  (`app/CLAUDE.md`)
- Worker traces stay off (`"traces": {}`). (`src/CLAUDE.md`)
- `CF_ACCOUNT_ID` stays a secret, not a `vars` entry: declined, no gain.
  (`src/CLAUDE.md`)
- The Cloudflare notification set is the owner's; no Universal SSL Alert.
  (`docs/cloudflare-security.md`)
- Fable at `max` effort only on the owner's word. (root `CLAUDE.md`)
