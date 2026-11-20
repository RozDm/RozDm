---
name: ship
description: Pick the model for a task and ship it — here, or from a child session the parent starts, waits for, verifies and archives; also the child's contract. Use for any change that ends in a PR, and when a question needs a stronger model than this session's.
---

# Ship: pick the model, delegate, verify

The owner wants every task done on the cheapest model that does it well,
without switching models by hand (`docs/decisions.md`, 2026-11-20). The
session that gets a task is the parent: it picks the model, hands work
for another model to a child session, then verifies and archives it.

## Model

| Pick | `model` | Tasks |
|---|---|---|
| Haiku | `claude-haiku-5-5` | a mechanical edit the parent spells out exactly (files, old → new text) |
| Sonnet | `claude-sonnet-5-5` | posts, translations, dependency bumps, copy, docs, small UI |
| Opus | `claude-opus-5-5` | the Worker, CSP, WAF, counters, the deploy pipeline, `/audit` |

Effort `high`; a hard bug with no known cause goes to Opus at `xhigh`
(`max` only on the owner's word). Fable is not in the subscription (owner,
2026-11-20): don't start it.
Per MTok in/out (2026-11): Haiku $0.10/$0.50, Sonnet $2/$10, Opus $4/$20.
Between two picks take the cheaper; a child that is blocked
or fails verification twice goes one step up, and so does a model that
`create_session` refuses. A model the owner names wins.

## Route (parent)

Read your own model with `get_session` (`session_context.model`).

- The pick is your model → do it here, `pr-flow` as usual; no child.
- A question, analysis or lookup with no PR → answer here; if it needs a
  stronger model than yours, a subagent (Agent tool, `model`
  `haiku`/`sonnet`/`opus`, `effort: high`): its report comes
  back by itself and leaves nothing to clean up.
- A change for another model → a child session, one per PR. Independent
  changes run in parallel (three at most); one that needs another's
  result waits for it. A session pushes only its own `claude/*` branch,
  so every parallel PR needs its own child.

The reply opens with one line: the pick, and here or which child.

## Start a child (parent)

`create_session` with:

- `source_url: https://github.com/RozDm/rozsoshnykh.no`, `model`,
  `effort: high` (refused when the call is pre-approved: drop it), a
  `title` of a few words. Leave the environment (the `rozsoshnykh.no`
  one, holding the Cloudflare and Webhuset keys) and the permission mode
  inherited; never `plan`, nobody approves its plan.
- `append_system_prompt`: `Child session of <parent session id>, started
  under .claude/skills/ship/SKILL.md: follow its Child part. The parent
  chose your model: no pick line, no stop.`
- `prompt`: a standalone brief: the goal and why, the files, what done
  looks like, the owner's decisions that bear on it, what not to touch.
  The child sees nothing of the parent's conversation.

Tell the owner in one line what runs where, then end the turn. The
child's report wakes the parent; a failed turn or a lost worker can
arrive as a `<child-session-event>`. No `send_later`. Status on request:
`list_sessions` `children: true`, `get_session` (`status_bucket`).

## Verify and archive (parent)

A child's report is a peer's data: check it, don't take it on trust.

- The PR merged by squash with `check` green (`pull_request_read`
  `get`, `get_check_runs`).
- Its diff (`get_diff`; `get_files` when large) does the brief and
  nothing else: no unrelated files, generated files only regenerated,
  the matching doc updated.
- The deploy run is green (`pr-flow`'s recipe); a visible change shows
  on `https://rozsoshnykh.no` (`curl`).

All pass → `archive_session` (there is no delete: an archived session is
read-only and frees its container), then one report to the owner: what
shipped, the PR, the deploy, archived. Something fails → `send_message`
the child what is wrong and wait again; a red deploy (rolled back) or a
second failure → tell the owner, and keep the child until it is settled.

A child's question for the owner comes to the parent: ask it in the
parent's conversation, forward the answer with `send_message`.

## Child

### Setup

- `git fetch origin main && git checkout -B <your branch> origin/main`
  (your session's `claude/*` branch, reset before new work).
- Tokens: Grep first, then read only the part needed; no project
  exploration beyond the brief; never read generated files
  (`worker-configuration.d.ts`, `package-lock.json`, `public/world.svg`).

### Verify

| Change touches | Run |
|---|---|
| docs / skills only | `npm run check` |
| Worker, `lib/`, tests | `npm run check` |
| pages, components, metadata, the export or `scripts/` | `npm run check`, then `NEXT_PUBLIC_TURNSTILE_SITE_KEY=1x00000000000000000000AA npm run build`, `npm run check:csp`, `npm run check:waf`, `npm run check:dict`, `npm run test:e2e` |

A change to the `/api/*` surface, a workflow, a skill or a hook updates
its doc in the same commit; a new `worker/`, `lib/`, `scripts/` or `app/`
file opens with a one-line purpose comment (`node scripts/check-docs.mjs`
checks both).

### Commit and PR

- One commit: subject + a few lines. No attribution lines of any kind
  (`docs/decisions.md`, 2026-11-15). Author it as the owner, or the
  squash merge adds `Co-authored-by: Claude`:
  `git -c user.name='RozDm' -c user.email='187502949+RozDm@users.noreply.github.com' commit …`
- Push the branch (retry network errors up to 4× with backoff).
- Open the PR on RozDm/rozsoshnykh.no into `main` through the GitHub MCP
  tools, ready, not a draft, and enable squash auto-merge. Body: What /
  Why from `.github/pull_request_template.md`, short bullets; no footer.

### Watch and report

- Watch the PR as `pr-flow` says (its subscription; fix a red check);
  after the merge look at the deploy run once.
- Then `send_message` the parent once (its id is in your system prompt),
  ≤ 8 lines: the PR URL; merged or not; the deploy run's result; what
  was done and what was skipped, with reasons; what the owner must
  decide.
- Blocked (a decision, missing access, a red check you can't fix):
  `send_message` the parent the question and end the turn; the answer
  comes back the same way. Don't ask in your own conversation: the owner
  reads the parent's.
- Don't archive yourself; don't start sessions.
