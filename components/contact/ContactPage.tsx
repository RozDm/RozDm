import Link from 'next/link'
import BackLink from '@/components/layout/BackLink'
import PageShell from '@/components/layout/PageShell'
import PageTitle from '@/components/layout/PageTitle'
import ContactForm from './ContactForm'
import { DICT } from '@/data/dictionary'
import { localePath, type Lang } from '@/lib/shared/i18n'

// The contact page, shared by /kontakt/ and /en/contact/.
export default function ContactPage({ lang }: { lang: Lang }) {
  const t = DICT[lang]
  return (
    <PageShell lang={lang} footer={{ invite: false }}>
      <BackLink href={localePath(lang, '/')}>{t.backHome}</BackLink>

      <PageTitle eyebrow={t.contact.eyebrow}>{t.contact.title}</PageTitle>
      <p className="text-gray-500 dark:text-gray-400 mb-2 max-w-xl">{t.contact.lead}</p>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-10 max-w-xl">
        {t.contact.privacyBefore}
        <Link
          href={localePath(lang, '/personvern/')}
          className="text-red-600 dark:text-red-400 underline underline-offset-2 hover:decoration-2"
        >
          {t.contact.privacyLink}
        </Link>
        {t.contact.privacyAfter}
      </p>

      <ContactForm />
    </PageShell>
  )
}
