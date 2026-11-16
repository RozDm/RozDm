# Workflows (.github/)

Traps only. What each workflow does, Dependabot, repo settings, the secret
model: `docs/reference/ci.md` (workflows: `ci.yml`, `deploy.yml`,
`status-watchdog.yml`, `analytics-report.yml`, `reset-metrics.yml`,
`d1-repair.yml`, `d1-bootstrap.yml`, `zone-rules.yml`). Decisions:
`docs/decisions.md`; the zone: `docs/cloudflare-security.md`.

- `check` (`ci.yml`) is the one required status; green only when `build`,
  `e2e` and `actionlint` all are. Never merge by hand while it is red or
  pending. A workflow change that actionlint flags is fixed, not silenced.
- shellcheck (`actionlint` job) covers every `run:` block and, by glob,
  every `scripts/*.sh` and `.claude/hooks/*.sh` — a new script there is
  checked automatically; findings get fixed, not silenced.
- Secrets live only in the `production` environment, none at repo level
  (public repo: any branch could read one). A job reading a secret runs in
  `production`, installs with `npm ci --ignore-scripts` and no npm cache; no
  `pull_request_target`, no `workflow_run`, no write scope
  (`tests/workflows.test.ts` enforces). "Required reviewers" stays off
  (owner's call): don't re-propose.
- Every action is pinned to a full commit SHA plus a release comment (test).
- Jobs install through `.github/actions/setup` (after checkout): setup-node
  from `.nvmrc` + `npm ci`. Its defaults (no cache, `--ignore-scripts`) are
  the secret-job rule; only a job without secrets passes `cache: 'true'` /
  `ignore-scripts: 'false'` (test). A new workflow uses it too.
- The Playwright image tag in `ci.yml` equals `@playwright/test`'s version
  (test): bump tag and digest with the package.
- `deploy.yml`: the `build` job has no secrets; an empty `TURNSTILE_SITE_KEY`
  fails it (the secret would 403 every form POST); `OWNER_INBOX` empty fails
  before anything is pushed. A red smoke runs `wrangler rollback` (code and
  pages, not D1/KV); a zone-caused failure fails the old version too: fix,
  re-run Deploy.
- `d1-repair.yml` `sql` refuses any statement naming `contact` (public logs):
  contact rows are the dashboard's D1 console, never a workflow.
- `reset-metrics.yml` is followed by a `METRICS_EPOCH` bump (`src/CLAUDE.md`).
- `zone-rules.yml` never writes the deprecated `ai_bots_protection`, and fails
  if a bot setting would block search engines or CI. A `403` carrying
  `X-Frame-Options: SAMEORIGIN` is Cloudflare's, not the site's.
- `status-watchdog.yml` runs outside Cloudflare on `7,22,37,52 * * * *`; an
  external uptime monitor was declined: don't re-propose. GitHub disables
  schedules after 60 days idle: re-enable in the Actions tab.
- Dependabot: every npm semver-major is ignored; merge a PR by enabling squash
  auto-merge as the owner (never a GITHUB_TOKEN merge workflow); the wrangler
  PR needs `npm run cf-typegen`, the Playwright PR the `ci.yml` digest. A
  weekly unattended session for this was declined: don't re-propose.
- Repo settings (auto-merge, delete head branches, no Wikis/Projects, CodeQL,
  push protection, About box) are owner-only; a session can't switch them.
- A workflow, skill or hook change updates `docs/reference/ci.md` in the PR.
