import { describe, expect, it } from 'vitest'
import { ESLint } from 'eslint'

// The layout rules in eslint.config.mjs (who may import whom) fire where they
// should and stay quiet where they shouldn't. The real config runs, minus the
// type-aware rules: they need a tsconfig program, which a snippet doesn't have.
const eslint = new ESLint({
  cwd: process.cwd(),
  overrideConfig: [
    {
      files: ['**/*.ts', '**/*.tsx'],
      languageOptions: { parserOptions: { project: null } },
      rules: { '@typescript-eslint/no-floating-promises': 'off', '@typescript-eslint/no-misused-promises': 'off' },
    },
  ],
})

async function violations(filePath: string, code: string): Promise<string[]> {
  const [result] = await eslint.lintText(code, { filePath })
  return result.messages
    .filter((m) => m.ruleId?.endsWith('no-restricted-imports') || m.ruleId === 'no-restricted-syntax')
    .map((m) => m.message)
}

const cases: { name: string; file: string; code: string; hit: RegExp | null }[] = [
  {
    name: 'the app imports the Worker',
    file: 'components/x/A.tsx',
    code: "import { isStale } from '@/worker/domain/status'\n",
    hit: /worker\/ is the Worker/,
  },
  {
    name: 'the app imports api-types as a type',
    file: 'components/x/A.tsx',
    code: "import type { GeoResponse } from '@/worker/api-types'\n",
    hit: null,
  },
  {
    name: 'the app imports api-types as a value',
    file: 'app/x/page.tsx',
    code: "import { GeoResponse } from '@/worker/api-types'\n",
    hit: /import type/,
  },
  {
    name: 'lib/server imports the Worker',
    file: 'lib/server/x.ts',
    code: "import { monitors } from '../../worker/domain/status'\n",
    hit: /worker\/ is the Worker/,
  },
  {
    name: 'lib/client imports lib/server',
    file: 'lib/client/x.ts',
    code: "import { getAllPosts } from '@/lib/server/blog'\n",
    hit: /build\/export time/,
  },
  {
    name: 'lib/client imports lib/shared',
    file: 'lib/client/x.ts',
    code: "import { SITE_URL } from '@/lib/shared/site'\n",
    hit: null,
  },
  {
    name: 'lib/shared imports lib/client',
    file: 'lib/shared/x.ts',
    code: "import { postVisit } from '../client/visit'\n",
    hit: /browser-only/,
  },
  {
    name: 'lib/shared imports a component',
    file: 'lib/shared/x.ts',
    code: "import { Footer } from '@/components/layout/Footer'\n",
    hit: /frontend/,
  },
  {
    name: 'lib/shared imports node:*',
    file: 'lib/shared/x.ts',
    code: "import { readFileSync } from 'node:fs'\n",
    hit: /no node:\*/,
  },
  {
    name: 'lib/shared imports api-types as a type, relative',
    file: 'lib/shared/x.ts',
    code: "import type { SeriesPoint } from '../../worker/api-types'\n",
    hit: null,
  },
  {
    name: 'the Worker imports lib/shared',
    file: 'worker/domain/x.ts',
    code: "import { CONTACT_ADDRESS } from '../../lib/shared/contact'\n",
    hit: null,
  },
  {
    name: 'the Worker imports lib/client',
    file: 'worker/domain/x.ts',
    code: "import { postVisit } from '../../lib/client/visit'\n",
    hit: /worker\/ is the Worker/,
  },
  {
    name: 'the Worker imports a component',
    file: 'worker/x.ts',
    code: "import { Footer } from '@/components/layout/Footer'\n",
    hit: /worker\/ is the Worker/,
  },
  {
    name: 'a client file imports lib/server',
    file: 'components/x/B.tsx',
    code: "'use client'\nimport { getAllPosts } from '@/lib/server/blog'\n",
    hit: /'use client' file never/,
  },
  {
    name: 'a server component imports lib/server',
    file: 'components/x/B.tsx',
    code: "import { getAllPosts } from '@/lib/server/blog'\n",
    hit: null,
  },
  {
    name: 'a route touches a binding',
    file: 'worker/routes/x.ts',
    code: 'export const f = (env: Env) => env.METRICS.prepare("x")\n',
    hit: /HTTP only/,
  },
  {
    name: 'a route calls apiError directly',
    file: 'worker/routes/x.ts',
    code: "import { apiError } from '../http'\nexport const f = () => apiError('bad_slug')\n",
    hit: /typed `refuse`/,
  },
  {
    name: 'a route refuses through the typed alias',
    file: 'worker/routes/x.ts',
    code: "import { apiError } from '../http'\nconst refuse: (code: 'bad_slug') => Response = apiError\nexport const f = () => refuse('bad_slug')\n",
    hit: null,
  },
  {
    name: 'a route passes env to a store',
    file: 'worker/routes/x.ts',
    code: "import { readViews } from '../domain/views-store'\nexport const f = (env: Env) => readViews(env, 'a')\n",
    hit: null,
  },
]

describe('eslint layout rules', () => {
  it.each(cases)(
    '$name',
    async ({ file, code, hit }) => {
      const found = await violations(file, code)
      if (hit) expect(found.join('\n')).toMatch(hit)
      else expect(found).toEqual([])
    },
    30_000,
  )
})
