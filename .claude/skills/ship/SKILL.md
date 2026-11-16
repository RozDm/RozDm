---
name: ship
description: Delegate a planned change to a subagent and ship it as one PR. Use when the orchestrating session has a change list ready and wants it implemented, verified, committed and opened as a squash-auto-merge PR without spending its own context.
---

# Ship a planned change

The orchestrating session writes only the change list; this file is the
fixed contract around it. Pass the subagent the list plus the sections
below.

## Model

- Sonnet — posts, docs, dependency bumps, copy, small UI.
- Opus — the Worker, CSP, WAF, counters, the deploy pipeline.

## Setup (subagent)

- `git fetch origin main && git checkout -B <session branch> origin/main`
  (the session's `claude/*` branch, reset before new work).
- Tokens: Grep first, then read only the part needed; no project
  exploration beyond the change list; never read generated files
  (`worker-configuration.d.ts`, `package-lock.json`, `public/world.svg`).

## Verify

| Change touches | Run |
|---|---|
| docs / skills only | `npm run check` |
| Worker, `lib/`, tests | `npm run check` |
| pages, components, metadata, the export or `scripts/` | `npm run check`, then `NEXT_PUBLIC_TURNSTILE_SITE_KEY=1x00000000000000000000AA npm run build`, `npm run check:csp`, `npm run check:waf`, `npm run check:dict`, `npm run test:e2e` |

A structural change (files added/moved/removed in `src/`, `app/`,
`components/`, `lib/`, or the `/api/*` surface) updates its doc in the same
commit (`node scripts/check-docs.mjs`).

## Commit and PR

- One commit: subject + a few lines. No attribution lines of any kind
  (`docs/decisions.md`, 2026-11-15). Author it as the owner, or the squash
  merge adds `Co-authored-by: Claude`:
  `git -c user.name='RozDm' -c user.email='187502949+RozDm@users.noreply.github.com' commit …`
- Push the branch (retry network errors up to 4× with backoff).
- Open the PR on RozDm/rozsoshnykh.no into `main` through the GitHub MCP tools — ready,
  not a draft — and enable squash auto-merge. Body: short bullets, what and
  why; no footer.

## Report back (≤ 8 lines)

PR URL; what was done and what was skipped, with reasons; verification
results; decisions the owner needs to make.

## After the merge (orchestrator)

Look at the deploy run once (`actions_list` `list_workflow_runs`,
`resource_id: deploy.yml`, `perPage: 1`): its smoke step is the real gate.
Report the merge + deploy result once, or a red check — not each PR event.
