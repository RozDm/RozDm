// Posts under one tag (Norwegian, /blogg/tag/<tag>/).

import type { Metadata } from 'next'
import TagPage, { tagMetadata, tagStaticParams } from '@/components/blog/TagPage'

interface Props {
  params: Promise<{ slug: string }>
}

export function generateStaticParams() {
  return tagStaticParams('nb')
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return tagMetadata('nb', (await params).slug)
}

export default async function BlogTag({ params }: Props) {
  return <TagPage lang="nb" slug={(await params).slug} />
}
