# Cloudflare security on the Free plan — zone rozsoshnykh.no

Why the edge in front of the Worker is set as it is, and what Free allows.
Read it before changing WAF, rate limiting or bot settings, and when a
visitor, `scripts/smoke.sh` or the watchdog gets a 403/429 the Worker didn't
send: Cloudflare's pages carry `X-Frame-Options: SAMEORIGIN` and no CSP, the
site's `DENY`. A Cloudflare 403 is the scanner rule, an AI-training UA or
(were it on) Bot Fight Mode; a 429 (error 1015) is the rate limit, or on
`/api/*` the spent Worker quota. **Code owns** what
`.github/workflows/zone-rules.yml` applies (what and why: its comments; its
Check prod step probes it live; it fails on dashboard bot settings that would
block search engines or CI) and `scripts/check-waf.mjs` guards the WAF
expression. **The rest is dashboard-managed.** Free facts:
developers.cloudflare.com, 2026-10-16; live state re-read 2026-11-16.

The point: the Worker has 100,000 requests/day per account (00:00 UTC; past
it `/api/*` gets 429). Since 2026-10-22 only `/api/*` and the MTA-STS policy
run it (`run_worker_first`); pages and files are the asset server's, free,
and stay up without quota. Requests blocked at the edge aren't counted.

## Deployed configuration — and why

Code (`zone-rules.yml`):
- **WAF "Block scanners"** (`.github/waf/scanner-block.expr`; 1 of 5 rules):
  "Scanner rule" below. **`error_no_store`**: 4xx/5xx → `no-store`.
- **`enable_js: false`** (JavaScript Detections; no Free dashboard switch):
  lesson 3. **AI Training = Disallow**, never the legacy field: "AI bots".
- **Browser Cache TTL 0, 0-RTT, Always Use HTTPS, `www_to_apex`** (www and
  mta-sts but its policy → apex; 1 of 10 redirect rules). **HTML rewriters
  off** (Automatic HTTPS Rewrites, Email Obfuscation, Replace insecure JS):
  they edit hashed pages and strip the ETag (2026-10-22, `docs/history.md`).
- **Minimum TLS**: code only raises it to 1.2; the dashboard's **1.3** is the
  owner's — clients without 1.3 (old Android/Java/OpenSSL 1.0 bots) can't
  connect; 1.2 is the wider-reach choice.

Dashboard:
- **Rate limit** 60 / 10 s per IP ("Rate limiting"). **Bot Fight Mode off**
  (lessons 2–3). **AI bot policies**: Search, Agent Allow; Bot Preference
  Sync on.
- **SSL/TLS Full (strict)** since 2026-10-26 (owner; was Full): no effect
  while apex, `www`, `mta-sts` are Worker custom domains; a proxied record
  to a real server would then need a valid certificate.
- **CT Monitoring** on (2026-10-23). **Free Managed Ruleset, L3–L7 DDoS** on;
  a custom rule with Skip → All managed rules exempts a false positive.
  **Browser Integrity Check**: an empty-UA request got 200 — don't rely on
  it. IP Access rules exist (country blocks Enterprise; Allow matches don't
  show in Events); leaked-credentials detection's rate-limit template would
  take the only rate limiting rule.
- **Web Analytics disabled** (2026-10-17): it injected a second beacon and
  stripped ETags; the site counts visits (`/api/visit`); the CSP refuses a
  returning injection, smoke's "no edge script" fails (`docs/history.md`).
- **Early Hints off** (declined 2026-11-16): edge-cached pages answer before
  the async 103 lookup (no 103 then) and the font is already a
  `<link rel=preload>`; it would cost a zone setting, a `Link` per page path in
  `public/_headers` (`tests/static-assets.test.ts`) and 103s before the WAF.
- **SPF stays `~all`** (declined `-all` 2026-11-16): DMARC `p=reject`
  already drops unaligned mail; nobody can show the Worker's `send_email` IPs
  are in `_spf.mx.cloudflare.net`, and a receiver hard-failing SPF first
  would bounce the owner's own mail (`mailfail` sees it only after). On a
  real need: apex TXT → `v=spf1 include:_spf.mx.cloudflare.net -all`, send
  one contact message, read its `Authentication-Results`.
- **DNS**: `dale`/`piper`, **DNSSEC on** — never off before removing the DS
  at the registrar (global SERVFAIL). Webhuset's `ns.datacenter.no` still
  holds the registration-time zone, but Norid delegates only to Cloudflare
  (RDAP 2026-11-06): inert. **Mail**: Email Routing (locked MX/SPF/DKIM
  records), DMARC `p=reject`, CAA = the Universal SSL CAs; MTA-STS
  (`enforce`) proxied by `worker/routes/mta-sts.ts`, TLS-RPT to `contact@`.
  `send_email` has no `destination_address`; the inbox is the `OWNER_INBOX`
  secret, never the repo.
- **HSTS** is the site's (`worker/csp.ts`; the apex is `preloaded`): leave Edge
  Certificates → HSTS off — a weaker dashboard policy would override it, and
  a preloaded domain that drops `preload` can leave the list.
- **workers.dev / previews**: `workers_dev`/`preview_urls: false`
  (`wrangler.jsonc`) undo any dashboard toggle each deploy; off they answer
  404 `1042` (smoke checks); there is no delete (`docs/history.md`).

Tokens (`production`, `.github/CLAUDE.md`): the deploy token is
`CW_API_TOKEN` from the "Edit Cloudflare Workers" template, extras (Pages,
Containers, Builds, Observability, Agents, Tail, Account Settings Read) kept
by the owner (2026-10-23), no zone settings; the zone token is
`zone-rules.yml`'s (scopes in its header). Neither has SSL and Certificates
or Notifications: CT Monitoring and alerts stay dashboard work.

## Owner to-do (dashboard only — the CI tokens can't do these)

- [ ] **Rotate the Turnstile secret** — due by 2027-04-22, then every 6–12
  months. Turnstile → the site's widget → Settings → Rotate Secret Key (the
  old secret stays valid for 2 hours, so the form never breaks) → GitHub →
  Settings → Environments → `production` → update `TURNSTILE_SECRET` →
  Actions → Deploy → Run workflow on `main` (its `secret bulk` pushes it to
  the Worker) → send one test message from `/kontakt/`. The site key
  doesn't change. Then move the due date here six to twelve months on.
- [x] MTA-STS/TLS-RPT DNS (2026-10-22): CNAME `_mta-sts` →
  `_mta-sts.mx.cloudflare.net` (**DNS only**), TXT `_smtp._tls` =
  `v=TLSRPTv1; rua=mailto:contact@rozsoshnykh.no`. Check: `dig +short TXT
  _mta-sts.rozsoshnykh.no` → `v=STSv1; id=…`.
- [x] CT Monitoring (2026-10-23): SSL/TLS → Edge Certificates → On + e-mail.
- [x] Notifications (2026-10-23, owner's set): Observability → Alerts →
  Platform Notifications — HTTP DDoS, Advanced Certificate, Incident
  (Workers, Assets, KV, D1, Email Routing, Turnstile, SSL, DNS), abuse
  report, New Blocks, New insight. No Universal SSL Alert (the watchdog's
  HTTPS check shows it); Free has none for the 100k/day limit.
- [x] Old CI credentials (2026-10-22): no Repository secrets; a secret under
  another name silently fell back to the repo-level one — check names first.
- [x] AI bot policies (2026-10-23): Security → Settings → Configure AI bot
  policies, Training "Disallow" (never "Block"); Security → Events for
  verified crawlers should show no Googlebot/Bingbot blocks.
- [x] Web Analytics (2026-10-17): account → Web Analytics → site → Manage
  site → **Disable**. Re-check from OUTSIDE the EU/EEA only (the "excluding
  EU" mode never injects for Norway; runners and sandbox are US): `curl -s -H
  'Accept: text/html' https://rozsoshnykh.no/ | grep -c 'beacon.min.js/v'` →
  0.

## Lessons from the rollout (2026-10-16)

1. 30/10 s counting everything 429'd visitors (a fresh page view is ~38
   requests in 10 s; Free counts cached and asset-first files whatever the
   toggle says) → static prefixes excluded, 60.
2. Bot Fight Mode 403'd GitHub runners (Azure VMs: watchdog, smoke, the
   zone-rules check). It can't be skipped on Free — only an IP Access rule
   matching first, impractical for GitHub's ranges → off; never on Free where
   CI or monitoring are automated clients.
3. Its JavaScript Detections loader is injected after the build hashed the
   scripts: refused every page view (a CSP report = a Worker request each),
   ETag stripped; it outlived BFM (`fight_mode: false, enable_js: true`);
   `enable_js: false` removed it in 10 s, though the docs say Free can't
   (`jsd_api_results_enabled` is another field). A nonce is copied only from
   a CSP header, never a hash; `'unsafe-inline'` is ignored next to hashes;
   `no-transform` kills edge compression (`/` 83 KB vs ~10). BFM back on would
   likely re-enable JSD.
4. `contains` is path-anywhere and case-sensitive: the old 52-pattern rule
   would 403 slugs like `/blogg/jenkins-pipeline/` (and its RSC, OG image,
   view counter), `.pl` 403'd `/planer/__next.planer.__PAGE__.txt`,
   `/WP-LOGIN.PHP` passed → the slug-safe rule.
5. Exclude static files by path prefix, not extension: `/x.png` isn't a
   static file, so a flood could append one and bypass the limit.

## Order at the edge

IP Access → Bot Fight Mode (own pipeline, position undocumented) → Single
Redirects → normalization, rewrites, config rules → DDoS → custom rules
(403) → rate limiting (429/1015) → Managed Ruleset → header transforms,
cache → Worker (`/api/*`) or static assets (`_headers`) → response header
transforms (and JSD injection, when on). Source: the [phases
list](https://developers.cloudflare.com/ruleset-engine/reference/phases-list/).

## WAF custom rules on Free

- 5 rules (an AI Crawl Control block takes one), 1 ruleset, every action but
  Log, no `matches` (Business+), ≤ 4,096 chars, 64 regexes per rule
  (wildcards' count undocumented — `check-waf` keeps ≤ 64), Block = the
  standard 403. Path, extension, host, IP, ASN, UA, `starts_with()`,
  `lower()`, `in`, `wildcard` work; "Path and Verified Bot only" is rate
  limiting's Free row.
- `contains`/`eq` are case-sensitive, `wildcard` case-insensitive and
  whole-path; `.extension` is lowercase, no dot, "" for a dot-first segment
  (`/.env`, so only the `/.` clause catches dotfiles); trailing-slash URLs
  undocumented — `check-waf` tries every reading.
- No Log: try a rule as Managed Challenge (Security → Analytics → Events),
  then Block. `?dry_run=true` validates without saving. `PUT` on a phase
  entrypoint **replaces every rule** — only POST/PATCH one rule.

## Scanner rule

The what is `.github/waf/scanner-block.expr` (~3.7k chars, 60 wildcards);
applied by `zone-rules.yml`, proven by `scripts/check-waf.mjs`. Slug-safe
because slugs and tags are `[a-z0-9-]` (`tests/blog-pairs.test.ts`), RSC
names use `$d$slug`, and the word part skips `/blogg/`, `/en/blog/`,
`/api/views/`, `/_next/static/`. **Only under those prefixes**: a new
slug-carrying section (`/prosjekter/<slug>/`) or `/api/*/<slug>` route must
join them — `check-waf` catches a blocked built page, not a new API route.
Lets through on purpose: would-be pages and cheap 404s (`/login`,
`/graphql`), rare paths (length), `.php~` tricks, word probes under the blog
(`.php`, dotfiles still blocked): 251 of a 313-path corpus (old rule 166).
Listed extensions are blocked everywhere: serve downloads from one exempted
folder. Only the dry run proves Free accepts it. Rollback: the run prints the
expression it replaces (the pre-2026-10-17 rule: this file's git history);
the next run restores the file's.

## Rate limiting on Free

1 rule; 10 s period and timeout only; per IP (+ `cf.colo.id`, explicit in
the API, `ratelimit` top-level, last in its list); fields **Path and Verified
Bot only**; no cache exclusion. Per data center, lagging, fail-open: a burst
brake, not a quota — 1.2 req/s from one IP stays under it and spends the
100k/day. Deployed (dashboard only), Block, 60 / 10 s, 10 s timeout:
`not (http.request.uri.path wildcard "/_next/static/*" or
http.request.uri.path wildcard "/fonts/*" or http.request.uri.path wildcard
"/icons/*" or http.request.uri.path eq "/world.svg" or http.request.uri.path
wildcard "/cdn-cgi/*")` — the prefixes are `public/_headers`' cache rules;
change both together. Why 60: one browser peaks at 16–18 non-static
requests/10 s, `smoke.sh` ~40 from one IP → ~3× / ~1.5× headroom. Optional,
now that only `/api/*` costs quota: `http.request.uri.path wildcard "/api/*"`
at ~20 (writes are capped by `WRITE_LIMITER`).

## AI bots

Security → Settings → **Configure AI bot policies** (the "Block AI bots"
toggle is deprecated); API `ai_search`, `ai_user`, `ai_training`. **Never
Training = Block**: since 2026-09-15 it also stops Googlebot, Bingbot,
Applebot; Disallow blocks only training crawlers. `zone-rules.yml` never
writes `ai_bots_protection` (writing it reset Training — `docs/history.md`).
`Google-Extended`/`Applebot-Extended` are robots.txt tokens: the managed
robots.txt prepends `Content-Signal` and their `Disallow: /` to
`app/robots.ts` (groups merge, ours hold; Lighthouse's flag on
`Content-Signal` is harmless). A spoofed Googlebot UA gets 200; the verified
one shows only in Security → Events.

## Dashboard paths

- Custom rules and rate limiting: Security → Security rules
  (`/:account/:zone/security/security-rules`).
- Bot Fight Mode, AI bot policies: Security → Settings
  (`/:account/:zone/security/settings`, filter "Bot traffic").
- What got blocked and by which service: Security → Analytics → **Events**
  tab (`/:account/:zone/security/analytics`; there is no `/security/events`
  for a zone). Free shows sampled events, 31 days.

## Read-only MCP tools (Webhuset, Cloudflare API)

`node scripts/mcp.mjs <server> list [filter]` names a server's tools and
`node scripts/mcp.mjs <server> <tool> '<json>'` calls one:

- `webhuset` — the registrar: domains, its leftover zone via `check_dns`,
  registry/DNS diagnostics, WHOIS.
- `cloudflare` — Cloudflare's API server (`mcp.cloudflare.com`, Code Mode:
  `search` finds endpoints in the API spec, `execute` runs a short script
  against them). For diagnosis — WAF and rate-limit events, zone settings,
  rules, DNS, the Worker's config and analytics — instead of asking the owner
  for dashboard screenshots. The token is read-only (Account: Account
  Settings, Account Analytics, Workers Scripts, Workers Observability; zone
  `rozsoshnykh.no`: Zone, Zone Settings, Zone WAF, Firewall Services, Bot
  Management, Transform Rules, DNS, Analytics, Workers Routes — all Read; no
  D1, R2, KV or Turnstile, so visitor data, backups and the Turnstile secret
  stay out). Changes still go through `zone-rules.yml` and the deploy, never
  through this.
  Example: `node scripts/mcp.mjs cloudflare execute '{"code":"async () =>
  (await cloudflare.request({ method: \"GET\", path: \"/zones\" })).result"}'`;
  `whoami` names the token's user.

On demand, not attached MCP servers: Webhuset's put ~1.5k tokens into every
session. Cloud sessions run in the owner's `rozsoshnykh.no` environment, which
holds both keys as network secrets for `mcp.webhuset.no` and
`mcp.cloudflare.com` (the proxy injects them; the value never enters the
container) — not Default, which the owner's other repositories share. A 401
"no key" from `scripts/mcp.mjs` means the session started on Default:
`switch_environment` to `rozsoshnykh.no` (network only, keeps the machine)
and retry. Its network is limited:
package registries, GitHub, the site's hosts, `mcr.microsoft.com`,
`challenges.cloudflare.com`; a missing host is proposed with
`update_environment`. Locally: `WEBHUSET_API_KEY` and
`CLOUDFLARE_READ_TOKEN`.
