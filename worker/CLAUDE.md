# Worker (worker/)

Traps only. Surface, bindings, cache/CSP, tests: `docs/reference/worker.md`;
file purposes: `node scripts/check-docs.mjs --map`; incidents: `docs/history.md`.

- Only `/api/*` and the MTA-STS policy run the Worker (`run_worker_first`:
  keep the key, or `/api/status` gets the 404 page). The 100k requests/day is
  the budget, so every `/api/*` call counts: clients fetch `cache: 'no-store'`,
  load below the fold only near the viewport, poll only what is on screen.
- CPU (Free: 10 ms): ~2 ms per D1 call, ~1 per KV/cache/fetch. Never a D1 call
  per loop item; `/api/contact` is ONE conditional `INSERT … RETURNING`.
- NEVER a per-request KV write (Free: 1000/day): KV `STATUS` is the 5-minute
  cron's alone; per-request data goes to D1 or Analytics Engine.
- `isWriteAllowed` is bot hygiene, NOT security (spoofable): consequences get
  their own defence (contact: Turnstile + `allowWrite`). Inflated counters are
  accepted (owner, 2026-11-10): no per-address cap.
- `/api/status` is public: `buildStatusData` strips monitor URLs (one is an
  admin login). The Worker can't fetch its own URL: use ASSETS.
- A new `/api/*/<slug>` route goes into the exemptions of
  `.github/waf/scanner-block.expr`, or a slug like `jenkins-pipeline` 403s.
- Edge-cache keys use validated params only (`cachedApiJson(canonicalUrl)`);
  keep `withStoredTtl` and zone-rules' "Respect Existing Headers".
- CSP: page `<meta>` and `HEADER_CSP` both apply, so no fetch directive in
  `HEADER_CSP`. Turn on nothing that makes the EDGE inject a script (JS
  Detections, Rocket Loader, Zaraz, Web Analytics): the CSP refuses it and each
  refusal is a Worker request. Trusted Types stays off (Next 16).
- D1 schema = `migrations/NNNN_<what>.sql` (`wrangler d1 migrations`): a
  schema change is a new numbered migration; never edit an applied one (the
  `d1_migrations` table won't re-run it). Land it backward-compatible with the
  deployed Worker, then run `d1-bootstrap.yml` (applies pending migrations).
- Contact: a failed mail send deletes its D1 row. Time windows use
  `isoCutoff()` as bound parameters, NEVER `datetime('now', …)` (ISO is TEXT).
- Status alerts are flap-damped: a failed KV read skips the tick, a failed
  write holds the mails. `HISTORY_LIMIT = 149` is intentional (1:4:9).
- `METRICS_EPOCH`: 6-hour UTC boundary; bump (round UP) after each
  `reset-metrics`. Quote AE `INTERVAL '6' HOUR` (bare 422s).
- Secrets live outside `wrangler.jsonc` (`worker/env.d.ts`, synced by
  `deploy.yml`); `OWNER_INBOX` never enters the repo. Traces stay off.
- Layout: `routes/<name>.ts` is path, `refuseMethod` (405 + `Allow`, before
  the edge cache; no HEAD), `validate.ts`, domain call, `http.ts` answer; an
  unclaimed `/api/` path is a JSON 404 `not_found`, never the 404 page. Rules
  live in `domain/<name>.ts`, bindings in `domain/<name>-store.ts` (a route touching `env.<binding>` and any import
  outside `worker/` but `lib/shared/` fail ESLint). A refusal is
  `apiError(code)` → `{ error: { code, message } }`, its status fixed per code
  in `API_ERRORS`: a new code goes there and into its route's union (routes call a
  typed `refuse`, not `apiError`; ESLint enforces it); clients read
  `code`, never `message`. No schema-validation dependency (owner's word).
- `worker/` checks under `tsconfig.worker.json`: `npm run cf-typegen` after a
  `wrangler.jsonc` change or wrangler bump, commit it. `csp`, `ip`,
  `validate`, `api-types`, the pure `domain/*` (not `*-store`) and the
  `lib/shared/` files they import also check under the app tsconfig:
  DOM-compatible APIs only. A changed answer shape
  changes `api-types.ts` (the `/api/*` contract) first.
- A new endpoint gets a worker test AND a `scripts/smoke.sh` check; a changed
  answer updates `e2e/api-stub.ts`. No `@cloudflare/vitest-pool-workers`.
