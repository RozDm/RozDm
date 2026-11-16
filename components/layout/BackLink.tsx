// The «← Hjem» / «← Tilbake» link at the top of an inner page.
import type { ReactNode } from 'react'
import Link from 'next/link'

// mb-8 is the distance to whatever follows: the page title, or the post's article.
export default function BackLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-1 text-sm text-gray-500 dark:text-gray-400 hover:text-red-600 dark:hover:text-red-400 transition-colors mb-8"
    >
      &larr; {children}
    </Link>
  )
}
