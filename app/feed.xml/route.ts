// RSS feed of the Norwegian blog (/feed.xml).

import { blogFeed } from '@/lib/server/feed'

export const dynamic = 'force-static'

export function GET() {
  return blogFeed('nb')
}
