// The eyebrow and the h1 that open an inner page, at one distance to what follows.
import type { ReactNode } from 'react'
import Eyebrow from './Eyebrow'

// mb-3 under the h1 on every page; a page's own lead or meta line adds no top
// margin of its own. A blog post has its own header (tags, date) and keeps
// its own h1.
export default function PageTitle({ eyebrow, children }: { eyebrow: ReactNode; children: ReactNode }) {
  return (
    <>
      <Eyebrow>{eyebrow}</Eyebrow>
      <h1 className="text-3xl md:text-4xl font-bold text-gray-900 dark:text-white mb-3">{children}</h1>
    </>
  )
}
