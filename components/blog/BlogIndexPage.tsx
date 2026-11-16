import type { Metadata } from 'next'
import BackLink from '@/components/layout/BackLink'
import PageShell from '@/components/layout/PageShell'
import PageTitle from '@/components/layout/PageTitle'
import BlogList from './BlogList'
import { DICT } from '@/data/dictionary'
import { getAllPosts, getAllTags } from '@/lib/server/blog'
import { blogPath, feedPath } from '@/lib/shared/blog-paths'
import { localePath, type Lang } from '@/lib/shared/i18n'
import { pageMetadata } from '@/lib/shared/metadata'

// The blog index, shared by /blogg/ and /en/blog/.
export function blogIndexMetadata(lang: Lang): Metadata {
  const t = DICT[lang].blog
  return pageMetadata({ lang, title: t.eyebrow, description: t.description, path: blogPath(lang) })
}

export default function BlogIndexPage({ lang }: { lang: Lang }) {
  const t = DICT[lang]
  return (
    <PageShell lang={lang}>
      <BackLink href={localePath(lang, '/')}>{t.backHome}</BackLink>

      <PageTitle eyebrow={t.blog.eyebrow}>{t.blog.title}</PageTitle>
      {/* The feed was only a <link rel="alternate"> in the head: nothing a
            reader could see. A plain <a> — it is a file, not a page. */}
      <p className="mb-10 text-sm text-gray-500 dark:text-gray-400">
        {t.blog.feedLead}{' '}
        <a
          href={feedPath(lang)}
          type="application/rss+xml"
          className="py-2 text-red-600 dark:text-red-400 underline underline-offset-4 hover:text-red-700 dark:hover:text-red-300 transition-colors"
        >
          {t.blog.feedLink}
        </a>
      </p>

      <BlogList posts={getAllPosts(lang)} tags={getAllTags(lang)} lang={lang} />
    </PageShell>
  )
}
