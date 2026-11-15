import type { Metadata } from 'next'
import HomePage from '@/components/home/HomePage'
import { pageMetadata } from '@/lib/metadata'
import { SITE_COPY } from '@/lib/site'

export const metadata: Metadata = pageMetadata({
  title: SITE_COPY.nb.title,
  absoluteTitle: true,
  description: SITE_COPY.nb.description,
  ogDescription: SITE_COPY.nb.tagline,
  path: '/',
  ownImage: true,
})

export default function Home() {
  return <HomePage lang="nb" />
}
