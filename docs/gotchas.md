# Root-config gotchas

Read before touching a root config file (`package.json`, `next.config.mjs`,
`eslint.config.mjs`, the tsconfigs, `wrangler.jsonc`). Site-wide map: root
`CLAUDE.md`; why each rule exists: `docs/history.md`.

- `wrangler.jsonc`: `workers_dev: false` and `preview_urls: false` stay
  explicit (owner's call; left out, wrangler turns workers.dev back on). The
  D1 database is `rozsoshnykh-metrics-v2`; never reclaim the old name.
- TypeScript: app `tsconfig.json` (lib.dom); Worker `tsconfig.worker.json` +
  generated `worker-configuration.d.ts`. After any `wrangler.jsonc` change or
  wrangler bump run `npm run cf-typegen` and commit it — `npm run typecheck`
  starts with `wrangler types --check`, which fails on a stale file.
- `next.config.mjs` sets the experimental `turbopackChunking: { minChunkSize:
  15000 }` so shared client modules aren't copied per page chunk
  (`docs/history.md`); `npm run check:dict` fails if the dictionary leaves
  its single chunk. After a Next upgrade, re-measure with prefetch on and
  drop the setting if the default stops duplicating. `agentRules: false`
  there keeps `next dev` from writing an AGENTS.md into the repo root.
- ESLint stays on 9 (the React plugin isn't ESLint-10-ready). Two rules run
  with types (`eslint.config.mjs`, both tsconfigs): `no-floating-promises`
  and `no-misused-promises` — a forgotten `await` in the Worker is a write
  that may never land. Mark a deliberate fire-and-forget `void`; don't
  disable the rule. Lint went from 4.4 s to 8.4 s for it (2026-11-11). TypeScript
  stays on 6: 7.0.2 (tried 2026-10-29) builds, but has no JS API, so
  typescript-eslint refuses it (tracked for 7.1+, typescript-eslint#10940),
  for ~3 s saved — not worth the npm-alias setup. Revisit when it supports 7.
- Prettier (`.prettierrc.json`, `.prettierignore`; `.editorconfig` matches) is
  part of `npm run check` and CI: `npm run format` fixes. No Tailwind plugin.
- `package.json` `overrides` (postcss-selector-parser under
  `@tailwindcss/typography`, minimatch under typescript-estree) exist only
  for audit advisories in pinned transitive deps; drop each once typography /
  typescript-eslint ship fixed pins.
- `package.json` is NOT `"type": "module"` (breaks the Next/turbopack config
  load); standalone Node scripts are `.mjs`.
- No R2 (needs a card) and no off-platform backup: D1 Time Travel (7 days on
  Free) is the only restore path, an accepted risk.
