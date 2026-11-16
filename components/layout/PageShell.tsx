// The frame of an inner page: Header, main#main (the skip-link's target), Footer.
import type { ComponentProps, ReactNode } from 'react'
import Header from './Header'
import Footer from './Footer'
import type { Lang } from '@/lib/shared/i18n'

// `alternate` is Header's: this page in the other language, when it knows
// better than the switch's default. `footer` is the Footer's own props, passed
// through whole — `{ invite: false }` on the contact page, `{ privacy: false }`
// on the privacy ones — so a new Footer prop needs no change here.
export default function PageShell({
  lang = 'nb',
  alternate,
  footer,
  children,
}: {
  lang?: Lang
  alternate?: string
  footer?: Omit<ComponentProps<typeof Footer>, 'lang'>
  children: ReactNode
}) {
  return (
    <>
      <Header lang={lang} alternate={alternate} />
      <main id="main" className="max-w-3xl mx-auto px-4 md:px-8 py-20 min-h-[70vh]">
        {children}
      </main>
      <Footer lang={lang} {...footer} />
    </>
  )
}
