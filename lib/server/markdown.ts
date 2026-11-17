// Renders post Markdown to HTML at build time: the one pipeline for the post page and the RSS body.

import { unified } from 'unified'
import remarkParse from 'remark-parse'
import remarkGfm from 'remark-gfm'
import remarkRehype from 'remark-rehype'
import rehypeHighlight, { type Options as HighlightOptions } from 'rehype-highlight'
import rehypeStringify from 'rehype-stringify'
import { common } from 'lowlight'
import powershell from 'highlight.js/lib/languages/powershell'
import { rehypeInlineCode } from './inline-code'
import { rehypePostImages } from './post-images'

// Code highlighting: lowlight's common languages plus PowerShell, which
// common lacks (a fence in a language left out renders plain).
const HIGHLIGHT_OPTIONS: HighlightOptions = { languages: { ...common, powershell } }

export interface MarkdownOptions {
  // Named in image error messages.
  post?: string
  // Feed: absolute image URLs, which feed readers need.
  absolute?: boolean
  // Page: words of inline code in nowrap spans (lib/server/inline-code.ts).
  // They hang on .code-word in app/globals.css, which a feed reader never
  // loads, so the feed leaves them out.
  inlineCode?: boolean
  // Page: <pre tabindex="0">, so a scrolling code block can be focused and
  // scrolled from the keyboard. Meaningless in a feed.
  focusablePre?: boolean
}

interface HastNode {
  type: string
  tagName?: string
  properties?: Record<string, unknown>
  children?: HastNode[]
}

function rehypeFocusablePre() {
  const walk = (node: HastNode) => {
    if (node.type === 'element' && node.tagName === 'pre') (node.properties ??= {}).tabIndex = 0
    node.children?.forEach(walk)
  }
  return walk
}

// Render a markdown string to an HTML string (build time): gfm, syntax
// highlighting, post images. The page and the feed differ only by options.
export async function markdownToHtml(markdown: string, options: MarkdownOptions = {}): Promise<string> {
  const { post, absolute, inlineCode, focusablePre } = options
  const processor = unified().use(remarkParse).use(remarkGfm).use(remarkRehype).use(rehypeHighlight, HIGHLIGHT_OPTIONS)
  if (inlineCode) processor.use(rehypeInlineCode)
  processor.use(rehypePostImages, { post, absolute })
  if (focusablePre) processor.use(rehypeFocusablePre)
  return String(await processor.use(rehypeStringify).process(markdown))
}
