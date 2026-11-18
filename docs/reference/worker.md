# Worker reference (worker/)

On-demand detail for the Worker, `/api/*` and serving. The traps to know
before editing `worker/` are in `worker/CLAUDE.md`; this file holds the surface,
bindings, rules and test setup. Per-file purposes: run `node scripts/check-docs.mjs --map`.
Incident background: `docs/history.md`.

## Serving (overview)

- Pages and files come from `out/` via the asset server — free,
  unlimited, no Worker request (`run_worker_first`: `/api/*` and the MTA-STS
  policy only). The Worker's 100k requests/day (then 429) can only take out
  `/api/*`. `scripts/finalize-export.mjs` (postbuild) bakes each page's hash
  CSP `<meta>` (`worker/csp.ts`; re-checked by `npm run check:csp`), `lang="en"`,
  the body font's preload on the 404, `/favicon.ico` and the slash-less 301s
  (`out/_redirects`). Headers: `public/_headers`, equal to the Worker's set
  (`tests/repo/static-assets.test.ts`). Details: Rules below.
- Worker: `/api/status`, `/api/views/<slug>`, `/api/geo`,
  `/api/visit`, `/api/timeseries`, `/api/contact`, `/api/csp-report`, the
  MTA-STS policy, the crons. Stores: KV `STATUS` (uptime snapshot), D1
  `rozsoshnykh-metrics-v2` (counters, contact log), Analytics Engine
  `rozsoshnykh_metrics` (time series). Every `/api/*` call is a Worker
  request: client fetches use `cache: 'no-store'`, share a fetch two
  components need, load nothing below the fold before a reader nears it
  (`lib/client/use-near-viewport.ts`) and poll only what's on screen.


## Module conventions

The module inventory is the purpose header of each file
(`node scripts/check-docs.mjs --map`); these are the conventions behind it.

- `index.ts` runs only for `/api/*` and the MTA-STS policy: HTTPS, the policy
  on any host, canonical-host 301s for the API (www and mta-sts are the edge's;
  this is the backstop), dispatch to `routes/`, an `/api/` path no route
  claims (any method) → `apiError('not_found')`, a JSON 404 with every API
  answer's headers (never the asset server's 404 page), and the cron
  dispatch (5-min health checks, daily contact prune: both in
  `domain/*-store.ts`).
- One structure for every `/api/*` route:
  - `routes/<name>.ts` claims its path (`null` when the path isn't its own,
    chained with `??` in `index.ts`), then the method gate
    `refuseMethod(request, [...])` (`http.ts`): any other method → 405
    `method_not_allowed` with `Allow` listing the served ones — first, ahead
    of the edge cache, so no other method reads or fills it. HEAD is not
    implied by GET and gets the 405 (nothing sends it: `smoke.sh`,
    `status-watchdog.yml` and the site all GET). Then parse and validate the input
    (`validate.ts`), call the domain, build the answer with the `http.ts`
    helpers. Bindings (D1, KV, AE, mail) stay out of it — ESLint fails
    `env.<binding>` here (`eslint.config.mjs`); `allowWrite`'s rate limiter
    is an HTTP gate.
  - `domain/<name>.ts` is the pure rules, DOM-compatible (tests import them
    under the app tsconfig; what the app needs too sits in `lib/shared/`:
    `contact.ts` limits, address, honeypot and email pattern, `status.ts`
    `isStale`/`failingSince`, `timeseries-keys.ts` `METRICS_EPOCH`):
    `contact.ts` (validation,
    Turnstile verify, MIME with the `Date` RFC 5322 requires and a
    `Message-ID`, the windows `CONTACT_WINDOWS_MS`/`isoCutoff`, the prune's
    `CONTACT_PRUNE_CRON`, held equal to `wrangler.jsonc` by a test — the
    privacy notice promises 30 days), `status.ts` (`monitors(env)`, NetBox's
    URL is the `NETBOX_URL` secret; snapshot/alert logic), `metrics.ts`
    (slug/country validation, bot filter, the `isWriteAllowed` header gate:
    Sec-Fetch-Site when sent, else — Safari < 16.4 — the `Origin` must be
    ours), `timeseries.ts` (metric/range parsing, AE SQL builder and parser,
    `METRICS_EPOCH`).
  - `domain/<name>-store.ts` is the Worker-only half, everything that holds
    a binding: `contact-store.ts` (the one-statement D1 windows + insert,
    the mail, the honeypot point, the daily prune), `status-store.ts` (the
    5-minute cron and the KV read), `geo-store.ts` (`recordGeo`, the D1
    read), `views-store.ts` (the ASSETS post check, count, read),
    `timeseries-store.ts` (the AE SQL API call), `csp-report-store.ts` (the
    one AE point).
  - `routes/mta-sts.ts` stays one file: it proxies a text policy with no
    store, rules or JSON — a split would add a file and nothing else.
- `validate.ts`: the hand-rolled validators (`oneOf`, `text`, `object`,
  `parseJson`) — no schema dependency. A validator answers the clean value
  or null; the route picks the code.
- `http.ts`: `apiJson()` (JSON + security headers), `apiError(code)` (the one
  error shape, status from `API_ERRORS`), `refuseMethod()` (the 405 + `Allow`), the edge-cache pair
  `cachedApiJson()`/`putCachedApiJson()`, `allowWrite()`, `readCapped()` (a
  body read that gives up past a byte cap).
- `csp.ts` is shared with the build (`metaCsp`, `withMetaCsp`, `cspProblems`
  run in `scripts/finalize-export.mjs` and `scripts/check-csp.mjs`; Node
  imports the `.ts` directly).
- `ip.ts`: `clientKey(ip)`: IPv4 as is, IPv6 as its /64 (`expandIpv6` first),
  IPv4-mapped back to IPv4.

## Bindings and data

- KV `STATUS`: only the uptime snapshot (`status` key), written only by the
  5-minute cron. Free = 1000 KV writes/day: NEVER a per-request KV write —
  per-request data goes to D1 (100k writes/day) or AE (100k points/day,
  shared by every channel).
- D1 `rozsoshnykh-metrics-v2` (`METRICS`; schema = `migrations/*.sql`,
  `migrations_dir` in `wrangler.jsonc`, applied by `d1-bootstrap.yml`):
  `views(slug, count)`, `geo(country, count)`,
  `contact(id, at, ip, name, email, message)`; counters are atomic
  `INSERT … ON CONFLICT … count = count + 1`.
- AE `rozsoshnykh_metrics` (`METRICS_AE`), channel in `blob1`: `geo` (every
  `recordGeo`; `blob2` country, `blob3` `AS<asn>`, `blob4` network org — a
  bot diagnostic, no IP), `view` (`/api/views` POSTs, not graphed), `csp`
  (one point per report POST), `mailfail` (one point per mail the Worker
  failed to send; `blob2` `contact` or `status`, nothing of the visitor's —
  the watchdog reads it, since a dead mail path can't mail), `honeypot` (one
  point per contact POST the honeypot dropped, behind `allowWrite(…,
  'honeypot')`, nothing of the visitor's — a false positive must show). Reads need `CF_ACCOUNT_ID` + `AE_API_TOKEN`
  (`Account Analytics:Read`); missing either, or AE slower than 8 s → empty
  series. Quote AE SQL `INTERVAL` literals (`INTERVAL '6' HOUR`; bare 422s).
- `METRICS_EPOCH` hides pre-relaunch AE points (AE is append-only). It must
  sit on a 6-hour UTC boundary (unit-tested; why: `docs/history.md`). Bump
  it after every `reset-metrics` run, rounding UP.
- `WRITE_LIMITER` (20/min per key, per location): `allowWrite(env, request,
  scope)` keys `<scope>:<clientKey(ip)>` for `/api/visit` (429),
  `/api/views` POST (falls back to a read), `/api/csp-report` (silent 204),
  `/api/contact` (429, a burst cap ahead of Turnstile — its D1 windows fail
  open). It fails open. The header gates are spoofable; this is what stops a
  POST loop burning D1's write quota. It does not stop inflated counters:
  "one person, once" is the browser's doing (localStorage), so a script can
  add ~29k visits or views a day per address. Accepted (owner's call,
  2026-11-10; `.github/SECURITY.md`, `docs/decisions.md`): the numbers are cosmetic and hidden
  below their thresholds, and a server-side cap per address would break the
  privacy notice's «ingen IP-adresser lagres i statistikken».
- Runtime secrets (`OWNER_INBOX`, `TURNSTILE_SECRET`, `CF_ACCOUNT_ID`,
  `AE_API_TOKEN`, `NETBOX_URL`) aren't in `wrangler.jsonc`: typed in
  `worker/env.d.ts`, synced by `deploy.yml`. `OWNER_INBOX` is where contact and
  status mail goes (the repo is public, so no inbox in the code; the
  `send_email` binding has no `destination_address`). Unset → every send
  fails: 502 / a `mailfail` point, so the watchdog goes red. (`CF_ACCOUNT_ID` → `vars` was declined: no gain.)

## API surface

The contract (each route's request/response JSON) is `worker/api-types.ts`, types only: routes build bodies with `satisfies`, clients and `e2e/api-stub.ts` import it.

Every refusal is `{ "error": { "code": "…", "message": "…" } }` (`ApiError`),
no-store, via `apiError(code)`. Clients branch on `code` (snake_case, the
`ApiErrorCode` union) and the HTTP status, never on `message`. A code has one
status on every route (`API_ERRORS` in `worker/http.ts`): `bad_slug`,
`bad_metric`, `bad_range`, `bad_request` 400; `forbidden`, `challenge_required`,
`challenge_failed` 403; `not_found` 404; `method_not_allowed` 405;
`payload_too_large` 413; `invalid` 422; `rate_limited` 429; `send_failed`
502; `unavailable` 503. `tests/worker/errors.test.ts` holds each route to it.

Two answers are the same on every path: a method the route doesn't serve is
405 `method_not_allowed` with `Allow` (the methods below, HEAD never), and an
`/api/` path no route claims is 404 `not_found`; `smoke.sh` checks both
(`GET /api/contact`, `/api/no-such-endpoint`).

- `/api/status` — GET, edge-cached 60 s. Public, so `buildStatusData`
  strips monitor URLs (`PublicMonitorResult`) — keep it so: one monitor is an
  admin login. Alert mails take the URL from the cron's own probes.
- `/api/views/<slug>` — GET, POST. GET reads; POST counts when `isWriteAllowed`, a
  non-datacenter ASN AND the slug is a published post page via ASSETS
  (`/blogg/<slug>/`, or `/en/blog/<slug>/` for an English-only post), so junk
  slugs mint no D1 rows. The slug is the view key (`lib/server/blog.ts viewKey`).
- `/api/geo` — GET, edge-cached 60 s. A failed D1 read is an uncached 503,
  never an empty map: `smoke.sh` and `status-watchdog.yml` probe D1 here.
- `/api/visit` — GET, POST. POST is the Besøk beacon: `recordGeo` writes the D1 `geo`
  row and the AE point (datacenter ASNs only to AE, as `bot`). GET is a
  harmless self-diagnostic (caller's country + whether it counts).
- `/api/timeseries?metric=view|geo|mailfail&range=24h|7d|30d|all` — GET;
  an unknown metric is 400 `bad_metric`, an unknown range 400 `bad_range`
  (no range is `7d`), both before the cache. Edge-cached per metric+range
  (`all` ≈ 90 days at 6 h; `mailfail` is the
  watchdog's, never charted). No AE secrets or a failed AE
  read → 200, empty `points`, `degraded: true`, edge-cached 20 s (under the watchdog's 30 s retry gap); the watchdog
  fails on `degraded`.
- `/api/contact` — POST (a GET is the 405, smoke-checked): a 32 KB body cap (413 `payload_too_large`, by
  Content-Length and while reading), `isWriteAllowed` (403 `forbidden`), honeypot (`HONEYPOT_FIELD`, a
  fake `ok:true` + a `honeypot` AE point), the burst cap,
  Turnstile when `TURNSTILE_SECRET` is set (siteverify bounded at 5 s; its
  `hostname` must be the request's), an e-mail pattern without
  `<>,;"()[]\:` (it lands in `Reply-To`), D1 limits per sender (`contact.ip`
  holds `clientKey(ip)`) and per address, and a 2-minute dedup (same address
  + message → ack'd, no second mail) — the windows, the dedup and the
  insert are ONE conditional `INSERT … SELECT … RETURNING` (a second read,
  only on a refusal, says 429 or dedup; it failing → 429). Keep it one: each
  D1 call is ~2 ms of CPU and four took the route to 9–10 ms (CPU below). The address is compared and stored
  lower-cased (`Reply-To` keeps it as typed); dots and `+tags` are left
  alone — providers differ. Anyone can spend an address's window for an
  hour: that is the limit's price, accepted.
- `/api/csp-report` — POST → always 204, AE only (anyone can POST): body via
  `readCapped` (64 KB); `parseCspReports` reads the Reporting API batch
  only (no policy sends `report-uri`, so a legacy `{"csp-report": …}` body
  is junk) and keeps own-origin reports (origin +
  path only) and a POST writes at most one point; a `blocked` that is
  neither a keyword nor a URL keeps only `[\w.:/-]`, a directive only
  letters and hyphens (they reach `analytics-report`'s public log). GET →
  the shared 405 (smoke-checked).
- `/.well-known/mta-sts.txt` — GET, any host (senders fetch it from
  `mta-sts.rozsoshnykh.no`, a custom domain). Proxies Cloudflare Email
  Routing's policy (`mta-sts.mx.cloudflare.net`, edge-cached 1 h) because
  our `_mta-sts` TXT is a CNAME to theirs — a copy in `public/` could name
  stale MX hosts and bounce mail under `mode: enforce`. Anything but a
  policy upstream → 503. The edge 301s every other path on that host
  (`zone-rules.yml`).
- A new `/api/*/<slug>` route goes into the WAF rule's exemptions
  (`.github/waf/scanner-block.expr`, like `/api/views/`): its word patterns
  would 403 a slug such as `jenkins-pipeline`; `check-waf` sees built pages
  only.

## Rules

- Two tsconfigs: `worker/` checks under `tsconfig.worker.json` (types from the
  generated `worker-configuration.d.ts`: `npm run cf-typegen` after any
  `wrangler.jsonc` change or wrangler bump — commit it — enforced by
  `wrangler types --check`; `docs/gotchas.md`). `csp.ts`, `ip.ts`,
  `validate.ts`, `api-types.ts`, the pure `domain/*.ts` (not `*-store.ts`) and
  the `lib/shared/` files they import are also checked under the app tsconfig
  (tests and the app import them): DOM-compatible APIs only there.
- A Worker can't fetch its own public URL: the site goes through ASSETS (the
  `/api/views` slug check). Don't monitor the site
  itself — it serves the dashboard.
- `isWriteAllowed` is bot hygiene, NOT security (spoofable headers):
  anything with consequences has its own defence (contact: Turnstile + rate
  limits; views: the ASSETS slug check).
- Edge-cached endpoints key the cache on validated params only
  (`cachedApiJson(canonicalUrl)`) so junk query strings can't bypass it. A
  hit re-sets the stored TTL (`withStoredTtl`): the zone's Browser Cache TTL
  once rewrote `max-age` on HITs. `zone-rules.yml` now sets "Respect
  Existing Headers"; keep both, and keep clients on `cache: 'no-store'`.
- CSP: each page carries `metaCsp(hashes)` as a `<meta>` right after the
  charset, ahead of any script (`COMMON_DIRECTIVES` incl.
  `upgrade-insecure-requests`, minus `frame-ancestors`, plus `report-to` →
  `/api/csp-report`; only Chromium reports from `<meta>`). No `report-uri`
  anywhere: `<meta>` can't carry it, and in `HEADER_CSP` it would report only
  that policy's four directives, never the hashed `script-src`, so Firefox
  and Safari stay silent by choice. Every asset
  response also gets `HEADER_CSP` (`public/_headers` `/*`, equal by test):
  `frame-ancestors`/`object-src`/`base-uri`/`form-action` only — both
  policies apply, so a fetch directive there would block the hashed inline
  scripts. The Worker's JSON and redirects get `ENFORCED_CSP` (no
  `unsafe-inline` script). Styles: `style-src 'self'` (no `<style>` element
  in the export) + `style-src-attr 'unsafe-inline'` for `style="…"`.
- Turn nothing on that makes the EDGE inject a script (JavaScript
  Detections, Rocket Loader, Zaraz, Web Analytics' automatic setup): the
  CSP refuses it and each refusal is a report, i.e. a Worker request.
  JavaScript Detections is off (`enable_js: false`, `zone-rules.yml`), Web
  Analytics is gone; `smoke.sh` ("no edge script") fails on an injected
  script. Turnstile's iframe logs `Refused to connect to 'data:,'` on the
  contact pages — Cloudflare's own iframe CSP, unreachable from ours and
  never reported; leave it (tested in `tests/worker/csp.test.ts`). Trusted Types is
  off: Next 16's chunk loader assigns `script.src` a plain string (revisit
  when Next supports it).
- Only `/api/*` and the MTA-STS policy run the Worker (`run_worker_first`;
  keep the key — without it a navigation to `/api/status` gets the 404
  page). Pages, files and misses come from the asset server: free, past the
  100k/day quota too. Their headers come from `public/_headers` (security
  set on `/*`, `X-Frame-Options` on page paths, `immutable` on
  `/_next/static/*`, a week on stable files, PNG type on OG cards), which
  never applies to a Worker response — `tests/repo/static-assets.test.ts` keeps
  it equal to `BASE_SECURITY_HEADERS` + HSTS + `HEADER_CSP` and no header in
  two rules (they'd join with a comma). A miss gets its path's `_headers`
  cache, which the `zone-rules.yml` rule turns into `no-store` on every
  4xx/5xx. HTML is `max-age=0, must-revalidate` with an ETag while the
  zone's HTML-rewriting features stay off. The zone's rate limiting rule
  excludes the static prefixes by hand (`docs/cloudflare-security.md`).
  `smoke.sh` canary: world.svg carries the week's cache AND no
  `X-Frame-Options` (served without the Worker).
- Status alerts are flap-damped (`CONSECUTIVE_FAILS_TO_ALERT = 2`): «nede»
  on the second failed probe in a row, «oppe igjen» on the first success
  after an alerted outage. `isStale`/`STALE_AFTER_MS` (20 min) grey out the
  banner and footer dot when the cron stops writing. A failed KV read skips
  the tick: read as "no snapshot yet", it wiped the history and the alert
  state (a second «nede» for one outage). A failed KV write holds the alert
  mails: "already mailed" lives in the snapshot, so a mail without it would
  repeat every tick. The mail goes out on the first stored tick; an outage
  that starts and ends while KV refuses writes is never mailed — the
  watchdog sees the stale snapshot. `HISTORY_LIMIT = 149` is
  intentional (1:4:9).
- Contact: a failed mail send deletes its D1 row (else the dedup would ack
  the retry without mailing it). Windows over `contact.at` are ISO cutoffs
  from `isoCutoff()` bound as parameters — NEVER `datetime('now', …)`, which
  mis-compares with ISO as TEXT.
- `/en/` HTML: `scripts/finalize-export.mjs` rewrites `<html lang="nb">` to
  `en` under `out/en/` (smoke-checked); the 404 page gets `lang="en"` from
  the theme head script on a missing `/en/…` path.
- Slash-less paths: `out/_redirects` 301s every page (generated at build);
  anything else gets `html_handling`'s 307. `/favicon.ico` is a build-time
  copy of `/icons/favicon.ico`.
- Failures swallowed for availability (D1 upserts, mail sends, prune, the
  contact form's D1 checks, which fail open, the KV reads and writes) still
  `console.error` — Workers Logs is the only place they show, except a
  failed mail send, which also writes the `mailfail` AE point. Traces stay
  off (`"traces": {}` enables nothing; owner's call, `docs/decisions.md`):
  from 2026-12-01 logs and traces share Free's 0.5 GB/day.

- CPU: Free allows 10 ms per request or cron run (then error 1102; an
  isolate tolerates an occasional overrun). Our JS is well under 1 ms; the
  cost is the binding calls — ~2 ms per D1 call, ~1 per KV, cache or fetch
  (measured 2026-11-16, `docs/history.md`). Add a binding call to a route
  only with a reason, never a D1 call per loop item. Watched by
  `status-watchdog.yml`'s `cpu` job (p99 over 24 h > 8 ms or any error fails); the
  heaviest events: the Workers Observability telemetry query with
  `$workers.cpuTimeMs` `gt` 6 (`node scripts/mcp.mjs cloudflare execute`).

## Tests

- Tests mirror the code: `tests/lib/{server,client,shared}`, `tests/worker/{routes,domain}`
  (+ `csp`, `ip`, `validate`, `index`), `tests/scripts`, repo-wide checks in
  `tests/repo`; a new test goes at its module's path. Under `tests/worker/**`
  imports are relative (`tsconfig.worker.json` has no `@/` alias).
- Route handlers, the entry's dispatch and both crons
  (`tests/worker/index.test.ts`) run under plain Vitest with in-process
  bindings from `tests/worker/fakes.ts`: D1 is REAL SQLite (`node:sqlite`,
  Node ≥ 22.5) loaded with `migrations/*.sql` in file-name order; KV, AE, Email Routing and
  ASSETS are fakes; `cloudflare:email` is aliased to a stub in
  `vitest.config.mts`. They type-check under `tsconfig.worker.json` (Node
  bits in `node-shims.d.ts`). `tests/worker/errors.test.ts`: one test per
  route for the error shape (`errorBody(code)` in `fakes.ts` builds the
  expected body); `tests/worker/validate.test.ts`: the validators.
- A new endpoint or route behaviour gets a test there AND a
  `scripts/smoke.sh` check. The browser tests' stand-in answers
  (`e2e/api-stub.ts`) are held to the handlers by
  `tests/worker/api-stub.test.ts`: a route change that alters an answer
  updates the stub. Not `@cloudflare/vitest-pool-workers` (it pins an older
  wrangler and an alpha miniflare).
