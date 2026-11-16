'use client'

import { DICT } from '@/data/i18n'
import { useLang } from '@/lib/use-lang'
import { lazyNearViewport } from '@/components/lazy-near-viewport'

// Reserves the card's height, so neither the wait nor the chunk shifts the layout.
function Placeholder() {
  const t = DICT[useLang()].trends
  return (
    <div className="bg-white dark:bg-gray-900/50 rounded-xl border border-gray-200 dark:border-gray-800 p-5 md:p-6 min-h-[340px]">
      <p className="text-gray-500 dark:text-gray-400 font-mono text-sm">{t.loading}</p>
    </div>
  )
}

// The Trends chart is the heavier client payload; it fetches /api/timeseries
// and /api/geo.
export default lazyNearViewport(() => import('./TrendsChart'), Placeholder)
