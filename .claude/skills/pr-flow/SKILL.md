---
name: pr-flow
description: The GitHub MCP call recipes and the routine around a PR — checking PR CI, looking at the deploy run, reading a red run's log, what to do after opening a PR. Use when opening, watching or merging a PR, or checking a deploy.
---

# PR and deploy flow

Moved out of the root `CLAUDE.md` so it loads only when a PR or deploy is
in play. The hard rules (no attribution, owner authorship, never merge past
a red `check`, never deploy from a sandbox) stay in the root.

## GitHub MCP recipes

One thing per call, minimal output:

- PR CI: `pull_request_read`, `method: get_check_runs`.
- The deploy: `actions_list`, `method: list_workflow_runs`,
  `resource_id: deploy.yml`, `perPage: 1` (unpaged listings repeat every
  squashed commit message).
- A red run's log: `get_job_logs` with `run_id`, `failed_only: true`,
  `return_content: true`, `tail_lines: 80` (the default is 500 lines).
  Widen only when the cause isn't in the tail.

## After opening a PR

- Open it ready with squash auto-merge. To hold one: a draft without
  auto-merge.
- The GitHub MCP tool appends a Claude footer to the PR body: remove it
  (`update_pull_request`). The squash message comes from the commits, so
  `main`'s history stays clean either way.
- Don't arm `send_later`: green `check` auto-merges in minutes and the PR
  subscription wakes the session on anything red.
- After the merge look at the deploy run once: its smoke step is the real
  gate (`wrangler rollback` runs on a red smoke).
- Don't narrate each PR event: report the merge + deploy result once, or a
  red check.
- Never merge by hand past a red or pending `check`.

## Model and effort

The pick and the delegation are `ship`'s. A cloud session reads its own
model and effort with `get_session` (`session_context.model`,
`effort_level`).

- The model differs from the pick → don't stop for a switch (a switch
  re-reads the whole conversation once without the cache): a child
  session (`ship`).
- Only the effort differs → say so in the opening line and go on. An
  effort change keeps the prompt cache and can be made mid-session;
  stopping on it cost a full round trip (2026-11-16).
- `new-post` (Sonnet, `high`) and `audit` (`high`) pin theirs for the
  turn in their frontmatter.

## Session branch

One `claude/*` branch per session, reset onto `origin/main` before new work
(else the next PR conflicts with its own). Reset locally, push only with a
new commit: a bare reset pushed after the merge re-creates the branch GitHub
deleted (claude/adoring-feynman-x7ppeb, 2026-11-16).
