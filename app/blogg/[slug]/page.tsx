import type { Metadata } from 'next'
import PostPage, { postMetadata, postStaticParams } from '@/components/blog/PostPage'

interface Props {
  params: Promise<{ slug: string }>
}

export function generateStaticParams() {
  return postStaticParams('nb')
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return postMetadata('nb', (await params).slug)
}

export default async function BlogPost({ params }: Props) {
  return <PostPage lang="nb" slug={(await params).slug} />
}
