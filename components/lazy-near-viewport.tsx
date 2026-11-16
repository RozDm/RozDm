'use client'

// Factory for the front page's below-the-fold widgets: code-split + mount near the viewport.

import dynamic from 'next/dynamic'
import { useRef, type ComponentType, type ReactNode } from 'react'
import { useNearViewport } from '@/lib/use-near-viewport'

// Code-splits a widget out of the initial bundle (ssr:false — it fetches its
// data on the client, nothing to render at build time) and mounts it only as
// its slot nears the viewport (lib/use-near-viewport.ts). `load` is the
// `() => import('./X')` thunk; the literal import() stays at the call site, so
// the bundler still sees one chunk per widget. `Placeholder` reserves the
// widget's final box (no layout shift) and is shown both while waiting for the
// viewport and while the chunk loads, so the two never differ.
export function lazyNearViewport(
  load: () => Promise<{ default: ComponentType }>,
  Placeholder: () => ReactNode,
  margin?: string,
): ComponentType {
  const Widget = dynamic(load, { ssr: false, loading: Placeholder })
  return function LazyNearViewport() {
    const ref = useRef<HTMLDivElement>(null)
    const near = useNearViewport(ref, margin)
    return <div ref={ref}>{near ? <Widget /> : <Placeholder />}</div>
  }
}
