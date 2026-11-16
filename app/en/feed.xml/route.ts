// RSS feed of the English blog (/en/feed.xml).

import { blogFeed } from '@/lib/feed'

export const dynamic = 'force-static'

export function GET() {
  return blogFeed('en')
}
