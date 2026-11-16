'use client'

import { DICT } from '@/data/i18n'
import { useLang } from '@/lib/client/use-lang'
import { lazyNearViewport } from '@/components/lazy-near-viewport'

// The placeholder reserves the final height (no layout shift, and the #footer
// hash target stays put) and reuses the 2001 loading line.
function Placeholder() {
  const t = DICT[useLang()].status
  return (
    <div className="min-h-[352px]">
      <p className="text-gray-500 dark:text-gray-400 font-mono text-sm">{t.loading}</p>
    </div>
  )
}

// The dashboard fetches its own data on the client, so there is nothing to
// render on the server.
export default lazyNearViewport(() => import('./StatusDashboard'), Placeholder)
