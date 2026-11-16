# Pages, languages, metadata reference (app/, lib/, data/)

On-demand detail for routes, i18n, metadata/SEO and fonts. The traps to know
before editing `app/`, `lib/` or `data/` are in `app/CLAUDE.md`. Blog rules:
`content/CLAUDE.md`; root config files: `docs/gotchas.md`.

## Structure and routes

- `app/` + `components/` — App Router, `trailingSlash: true`, Tailwind v4
  (no config file; `@theme` in `app/globals.css`).
- Routes: `/` + `/en/` (Hero/Skills/Certifications/Status/Visitors/Trends),
  `/blogg/…` + `/en/blog/…` (index, `[slug]`, `tag/[slug]`), `/kontakt` +
  `/en/contact`, `/personvern` + `/en/privacy` (the Norwegian notice is
  authoritative — change both), `feed.xml` + `en/feed.xml`, sitemap, robots,
  manifest, OG images, `/icons/*.png` + `favicon.ico` (build-time, from
  `app/icon.svg` via `app/icons/[name]/route.tsx`; the build copies the ico
  to `/favicon.ico`), `/.well-known/security.txt` (static, RFC 9116: bump
  `Expires` yearly — `tests/repo/static-assets.test.ts` fails 30 days ahead),
  `/status` → `/#status` (`public/_redirects`; www → apex and HTTP → HTTPS
  are the edge's, `zone-rules.yml`).
  `https://mta-sts.rozsoshnykh.no/.well-known/mta-sts.txt` is the mail
  MTA-STS policy, a Worker custom domain proxying Cloudflare Email Routing's
  (`worker/routes/mta-sts.ts`). `error.tsx` / `global-error.tsx`: HAL-voiced
  «Systemfeil» boundaries.
- `app/template.tsx` cross-fades client-side route changes (450 ms,
  OPACITY ONLY — a transform would trap the fixed intro overlays and sticky
  header), never the document's first page (LCP); keyed by pathname; both
  front pages opt out (the intro's overlay); honours reduced motion.

## Languages

- ALL UI copy lives in `data/dictionary.ts` (`nb` defines the shape,
  `en` is typed against it, `tests/lib/shared/i18n.test.ts` checks parity) — never in a
  component. Exceptions: `app/error.tsx` reads `ERROR_COPY`
  (`data/dictionary-error.ts`, spread into both): importing `DICT` there put a
  second dictionary copy on every page; and the privacy notices' text stays
  in their pages (`app/personvern/page.tsx`, `app/en/privacy/page.tsx`) — a
  document, not UI copy, and the dictionary ships with every page (only the
  labels they share with the site come from `DICT`). Both languages share the page
  components (`HomePage`, `ContactPage`, the blog pages); server components
  take `lang` from their page, client components call `useLang()`. Page links go through
  `localePath()` (`lib/shared/i18n.ts`); blog posts/tags pair dynamically and pass
  their twin as `Header alternate` + `pageMetadata({ languages })`.
  Bilingual data: `Localized` + `pick()`. The export always says
  `<html lang="nb">`: `scripts/finalize-export.mjs` rewrites `/en/` pages,
  `HtmlLang` follows client navigation, and the theme head script sets it on
  any `/en/` path (the one `404.html` answers `/en/` misses too and shows
  its English copy on `html[lang=en]`).

## Metadata and SEO

- Every page uses `pageMetadata()` (`lib/shared/metadata.ts`; `lang: 'en'`
  sets og:locale, hreflang, the English OG card, `/en/feed.xml`). Next merges
  metadata SHALLOWLY — a page setting part of `openGraph`/`alternates` drops
  the rest. The root layout has no canonical/og:url (the 404 inherits it).
  Name, roles, titles and `THEME_BG` live in `lib/shared/site.ts`; the contact
  address in `lib/shared/contact.ts` — never hard-code them.
- SEO: canonicals with trailing slashes, OG images via `next/og` (Intel One
  Mono from Fontsource WOFF, `lib/server/og-fonts.ts` — next/og can't read WOFF2),
  JSON-LD (Person + WebSite sitewide from `personJsonLd()` in
  `lib/shared/metadata.ts`: `knowsAbout` from `data/skills.ts` minus the learning
  group, `hasCredential` from `data/certifications.ts` — a certificate `url`
  also makes its card a link; BlogPosting + BreadcrumbList per post), RSS per
  language, hreflang (pages + sitemap), prev/next, tag pages. Tag pages are
  noindex and out of the sitemap unless in `INDEXED_TAGS` (`data/tags.ts`) —
  add one ONLY on the owner's command. `robots.index: false` in
  `app/layout.tsx` until launch — flip it only when the owner says so (not
  with the first post; their call, 2026-11-09), together with the e2e test
  "pre-launch: every page tells search engines noindex" and the home check
  in `scripts/smoke.sh` (all three, or CI or the deploy fails; steps:
  `/new-post`), then the owner submits the sitemap. `/kontakt`, `/personvern`
  and utility pages stay noindex for good; the sitemap never lists noindex
  URLs (pre-launch excepted).

## Font

- Intel One Mono via CSS variables. Body font (`lib/server/fonts.ts`): Intel One
  Mono self-hosted from
  `@fontsource-variable/intel-one-mono` through `next/font/local` — the
  build needs no network (a Google-font build fails offline). Four subset
  families with their own `unicode-range`, all in the stack in
  `app/globals.css`; Turbopack names each family after its const, so never
  rename one through `declarations` (the variable keeps the const's name).
  `display: 'optional'` + `preload: true` (no late swap, no reflow; the
  preload makes a first visit catch the block window) and
  `adjustFontFallback: false`. `finalize-export.mjs` copies the preload to
  the 404 (the build fails if `index.html` has none).
