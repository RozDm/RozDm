'use client'

import { DICT } from '@/data/i18n'
import { useLang } from '@/lib/client/use-lang'
import { lazyNearViewport } from '@/components/lazy-near-viewport'

// The same box and line GeoMap shows while the SVG loads — same aspect ratio,
// so neither the wait for the section nor the chunk landing shifts the layout
// at any width (a fixed min-height used to shrink on phones and grow on
// desktops), and no second loading message flashes by.
function Placeholder() {
  const t = DICT[useLang()].visitors
  return (
    <div className="w-full aspect-[2000/1001] flex items-center justify-center">
      <p className="text-gray-500 dark:text-gray-400 font-mono text-sm">{t.loading}</p>
    </div>
  )
}

// GeoMap is mounted only as the section nears the viewport: it fetches
// /api/geo, the ~96 kB world.svg and — for the legend — the flag font, none of
// it useful at build time or to a visitor who never scrolls down.
export default lazyNearViewport(() => import('./GeoMap'), Placeholder)
