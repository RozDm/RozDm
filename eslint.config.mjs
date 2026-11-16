import nextCoreWebVitals from 'eslint-config-next/core-web-vitals'
import nextTypeScript from 'eslint-config-next/typescript'

// Where code may import from (ARCHITECTURE.md has the map). Patterns match the
// import specifier as written, so the `@/…` alias and a relative path both hit.
// Not covered: dynamic import(), require(), and a type-only import from a
// layer that is otherwise barred is still flagged (no escape hatch).
const API_TYPES = '**/src/api-types'
const lib = (layer) => `**/lib/${layer}/**`

const noSrcFromApp = [
  {
    group: ['**/src/**', `!${API_TYPES}`],
    message:
      'src/ is the Worker: the app and lib/ never import it. Shared rules and constants live in lib/shared/ (the Worker imports those); the /api/* contract is src/api-types.ts.',
  },
  {
    group: [API_TYPES],
    allowTypeImports: true,
    message:
      'src/api-types.ts is the shared /api/* contract: import it as `import type` only — it carries types, never runtime values.',
  },
]
const noServerLib = {
  group: [lib('server'), '../server/**'],
  message:
    'lib/server/ runs at build/export time (blog, markdown, feed, OG, fonts, node:fs): browser code and shared code never import it. Move the shared part to lib/shared/.',
}
const noClientLib = {
  group: [lib('client'), '../client/**'],
  message: 'lib/client/ is browser-only (hooks, fetchers): lib/shared/ and the Worker never import it.',
}
const noAppLayers = {
  group: ['**/app/**', '**/components/**'],
  message: 'app/ and components/ are the frontend: lib/shared/ and the Worker never import them.',
}
const noNodeInShared = {
  group: ['node:*'],
  message:
    'lib/shared/ is pure and runs in the browser and the Worker: no node:* — Node-only code goes to lib/server/.',
}
const noFrontendFromWorker = [
  {
    group: ['**/app/**', '**/components/**', '**/data/**', '**/context/**', lib('client'), lib('server')],
    message:
      'src/ is the Worker: it never imports the frontend, lib/client/, lib/server/ or data/. What both sides need goes in lib/shared/ (pure, no DOM, no Node) or src/api-types.ts.',
  },
]
const restrictImports = (...patterns) => ['error', { patterns: patterns.flat() }]

// A 'use client' file ships to the browser; lib/server/ (node:fs, the markdown
// pipeline) must never end up in it. A glob can't see the directive, so this
// is a selector: the directive and an import of lib/server/ in one file.
const SERVER_SOURCE = String.raw`/lib\/server\//`
const noServerInClient = (kind) => ({
  selector: `Program > ExpressionStatement[directive='use client'] ~ ${kind}[source.value=${SERVER_SOURCE}]`,
  message:
    "A 'use client' file never imports lib/server/ (build-time code: node:fs, markdown, OG). Move what the browser needs to lib/shared/.",
})
const clientSelectors = [
  noServerInClient('ImportDeclaration'),
  noServerInClient('ExportNamedDeclaration'),
  noServerInClient('ExportAllDeclaration'),
]

// Routes are HTTP only: the bindings (KV, D1, Analytics Engine, mail) are
// touched in src/domain/*-store.ts, never in a handler.
const routeSelectors = [
  {
    selector: "MemberExpression[object.name='env'][property.name=/^(STATUS|METRICS|METRICS_AE|CONTACT_EMAIL)$/]",
    message:
      'src/routes/ is HTTP only: read and write KV, D1, Analytics Engine and mail through a src/domain/*-store.ts function, not env.<binding> in a handler.',
  },
]

const config = [
  {
    ignores: ['.next/**', 'out/**', 'node_modules/**', '.wrangler/**', 'worker-configuration.d.ts', 'next-env.d.ts'],
  },
  ...nextCoreWebVitals,
  ...nextTypeScript,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },
  // The two rules that need types: a promise nobody awaits. In the Worker a
  // forgotten `await` is a write that may never land (the isolate can stop
  // once the response is out), and no untyped rule sees it. Both tsconfigs:
  // the app's leaves out src/ and tests/worker, the Worker's has them. A
  // deliberate fire-and-forget is marked `void`, not disabled. JSX handlers
  // (`onClick={async …}`) are exempt: React ignores what they return.
  {
    files: ['**/*.ts', '**/*.tsx', '**/*.mts'],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.json', './tsconfig.worker.json'],
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': ['error', { checksVoidReturn: { attributes: false } }],
    },
  },
  // Layout: who imports whom (the rules above the config). ESLint keeps only
  // the last matching block's options per rule, so the blocks are disjoint
  // where they set the same rule.
  {
    files: ['components/**', 'app/**', 'lib/server/**'],
    rules: { '@typescript-eslint/no-restricted-imports': restrictImports(noSrcFromApp) },
  },
  {
    files: ['lib/client/**'],
    rules: { '@typescript-eslint/no-restricted-imports': restrictImports(noSrcFromApp, noServerLib) },
  },
  {
    files: ['lib/shared/**'],
    rules: {
      '@typescript-eslint/no-restricted-imports': restrictImports(
        noSrcFromApp,
        noServerLib,
        noClientLib,
        noAppLayers,
        noNodeInShared,
      ),
    },
  },
  { files: ['src/**'], rules: { '@typescript-eslint/no-restricted-imports': restrictImports(noFrontendFromWorker) } },
  { files: ['**/*.ts', '**/*.tsx'], rules: { 'no-restricted-syntax': ['error', ...clientSelectors] } },
  { files: ['src/routes/**'], rules: { 'no-restricted-syntax': ['error', ...clientSelectors, ...routeSelectors] } },
]

export default config
