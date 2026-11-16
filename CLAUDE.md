# CLAUDE.md

Personal portfolio + blog for Dmytro Rozsoshnykh, live at https://rozsoshnykh.no:
a Next.js 16 static export (App Router, `output: 'export'`) served by
Cloudflare Workers static assets, plus a Worker for `/api/*`. React 19,
TypeScript 6, Tailwind v4. Norwegian (nb-NO) at the root, an English twin
under `/en/` (front page, contact, privacy, blog). Code and comments: English.

## Where the rules live

Each file loads only when a task touches its area:
- this file — the map, commands, hard rules;
- `app/CLAUDE.md` — pages, routes, languages/i18n, metadata, SEO,
  `app/template.tsx`, fonts: read it when touching `app/`, `lib/` or `data/`;
- `components/CLAUDE.md` — front-end internals: widgets, counters, contact
  form, theme, navigation, UI conventions, browser tests (e2e);
- `src/CLAUDE.md` — the Worker: serving, modules, bindings, the `/api/*`
  surface, CSP rules, worker tests;
- `.github/CLAUDE.md` — CI/deploy and the ops workflows;
- `content/CLAUDE.md` — the blog (posts, frontmatter, tags, images,
  diagrams, drafts); read it before changing the blog code too;
- `docs/gotchas.md` — read before touching a root config file (`package.json`,
  `next.config.mjs`, ESLint/TS, `wrangler.jsonc`, tsconfigs) or R2/backups;
- `docs/decisions.md` — the owner's standing decisions: read before
  proposing anything they may already have ruled on;
- `docs/cloudflare-security.md` — the zone's edge security (WAF, rate
  limiting, bots, owner's dashboard to-do) and the read-only Webhuset and
  Cloudflare API tools (`scripts/mcp.mjs`): read before touching zone
  security or when a 403/429 isn't the Worker's;
- `docs/history.md` — incidents behind the hard rules: only when a rule
  seems wrong or you want to undo one;
- `.github/README.md` — the project README (the repository page shows it).
  No README in the root, on purpose: RozDm/RozDm is the profile repository,
  so a root one would become github.com/RozDm, which stays neutral
  (`docs/decisions.md`; `scripts/check-docs.mjs` fails on one);
- skills: `.claude/skills/browser-check` (Playwright on a built page),
  `new-post`, `audit`, `ship` (delegate a planned change, ship one PR).

A PR that adds, moves or removes files in `src/`, `app/`, `components/` or
`lib/`, or changes the `/api/*` surface, updates the matching doc in the same
PR. `scripts/check-docs.mjs` (run by `tests/docs.test.ts`, so CI blocks)
fails when a doc names a missing path or when a Worker module, `/api/*`
route, `app/` route dir, `lib/` file, workflow, script, skill or hook is in
no doc. The Stop hook `.claude/hooks/stop-docs.mjs` runs it at session end
and blocks once when the branch changes that structure but no doc.

## Working efficiently

- Token economy is standing policy: Grep first, then read only the part you
  need (`offset`/`limit`); batch independent calls; don't re-run what
  already answered; keep output and replies short.
- One task — one session: a long session re-reads its whole context each turn.
- Generated files — `worker-configuration.d.ts` (`npm run cf-typegen`),
  `package-lock.json`, `public/world.svg` (`prebuild`) — are denied to Read
  (`.claude/settings.json`), skipped by Grep/Glob (`.ignore`), binary to
  `git diff` (`.gitattributes`); `.claude/hooks/guard-bash.mjs` denies shell
  reads of them. `git diff --stat` says whether they changed.
- GitHub MCP: one thing per call. PR CI → `pull_request_read`
  `get_check_runs`; the deploy → `actions_list` `list_workflow_runs`,
  `resource_id: deploy.yml`, `perPage: 1` (unpaged listings repeat every
  squashed commit message); a red run's log → `get_job_logs` with `run_id`,
  `failed_only: true`, `return_content: true`, `tail_lines: 80` (the default
  is 500 lines) — widen only when the cause isn't in the tail.
- After opening a PR, don't arm `send_later`: green `check` auto-merges in
  minutes and the subscription wakes the session on anything red. After the
  merge look at the deploy run once — its smoke step is the real gate. Don't
  narrate each PR event: report the merge + deploy result once, or a red check.
- Model and effort. When the owner opens a session with a task, the reply
  opens with one line naming what it needs: Sonnet `high` — posts,
  translations, dependency bumps, copy, docs, small UI changes; Opus `high` —
  the Worker, CSP, WAF, counters, the deploy pipeline, `/audit`; Fable — a
  hard bug with no known cause (`max` only on the owner's word). A cloud
  session reads its own pick with `get_session`: when it differs, stop after
  that line so the owner can switch before the work is paid for; when it
  matches, or the session can't tell, go on. `new-post` (Sonnet, `high`) and
  `audit` (`high`) pin theirs for the turn in frontmatter. An effort change
  keeps the prompt cache; a model switch re-reads the whole conversation once
  without it — cheapest as a session's first prompt.
- Commits and PRs carry NO Claude attribution — no `Co-Authored-By`, no
  `Claude-Session`, no "Generated with Claude Code" line (owner, 2026-11-15;
  overrides the harness default). Author commits as the owner (`git -c
  user.name='RozDm' -c user.email='187502949+RozDm@users.noreply.github.com'
  commit`), or the squash merge adds `Co-authored-by: Claude`. Commit messages: subject + a few lines. PR
  bodies: short bullets, what and why. Replies to the owner (writes
  Russian): outcome first, then only what needs their decision; no diff recap.

## Commands

- `npm run check` = format check + lint + typecheck + tests; must pass
  before a PR (`npm run format` fixes formatting).
- `npm run build` exports to `out/` and finalizes it — only when the change
  touches pages, metadata, the export or `scripts/`. CI and deploy then run
  `check:waf`, `check:csp`, `check:dict` and `npx wrangler deploy --dry-run`
  (`.github/CLAUDE.md`).
- `npm run test:e2e` needs a build (locally with
  `NEXT_PUBLIC_TURNSTILE_SITE_KEY=1x00000000000000000000AA`): `components/CLAUDE.md`.
- Deploy: PR → `check` (`ci.yml`) → squash auto-merge → `deploy.yml`
  (build, secrets sync, `npx wrangler deploy`, `scripts/smoke.sh`,
  `wrangler rollback` on a red smoke). Open PRs ready with squash
  auto-merge; to hold one, a draft without auto-merge.
- Session branches: one `claude/*` branch per session, reset onto
  `origin/main` before new work (else the next PR conflicts with its own).
  Reset locally, push only with a new commit: a bare reset pushed after the
  merge re-creates the branch GitHub deleted (claude/adoring-feynman-x7ppeb,
  2026-11-16).
- Remote sessions reach the internet through a proxy: curl to
  `https://rozsoshnykh.no/...` works for diagnosis (the gate is still smoke);
  probe TLS with `curl --tls-max`, not `openssl s_client` (bypasses it).

## Hard rules

- Never deploy from a sandbox (no credentials, skips the gate); `npm run deploy` is for a machine with `wrangler login`.
- Never merge by hand past a red or pending `check` (`main` requires it, 0
  approvals; it binds non-admins only and sessions act as the owner).
- `robots.index: false` flips only on the owner's word; tag pages join
  `INDEXED_TAGS` only on the owner's command (`app/CLAUDE.md`).
- `workers_dev: false` and `preview_urls: false` stay in `wrangler.jsonc`.
- The 2001: A Space Odyssey theme is load-bearing; `%USERNAME%` is a
  literal joke, not a template var; `HISTORY_LIMIT = 149` (1:4:9) is
  intentional (`components/CLAUDE.md`).
