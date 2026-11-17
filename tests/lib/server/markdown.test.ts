import { describe, expect, it } from 'vitest'
import { markdownToHtml } from '@/lib/server/markdown'

// The page and the feed run one pipeline (markdownToHtml); they differ by options only.
describe('code highlighting', () => {
  it('colours PowerShell, which lowlight’s common set lacks', async () => {
    const html = await markdownToHtml('```powershell\n# the adapter\nGet-NetAdapter\n```\n')
    expect(html).toContain('<code class="hljs language-powershell">')
    expect(html).toContain('<span class="hljs-comment"># the adapter</span>')
    expect(html).toContain('<span class="hljs-built_in">Get-NetAdapter</span>')
  })

  it('still colours the common languages', async () => {
    expect(await markdownToHtml('```bash\necho hi\n```\n')).toContain('<span class="hljs-built_in">echo</span>')
  })
})

describe('options', () => {
  it('inlineCode wraps inline code words in nowrap spans, and only when asked', async () => {
    const md = 'Run `curl -v` now.\n'
    expect(await markdownToHtml(md)).toBe('<p>Run <code>curl -v</code> now.</p>')
    expect(await markdownToHtml(md, { inlineCode: true })).toContain(
      '<code><span class="code-word">curl</span> <span class="code-word">-v</span></code>',
    )
  })

  it('focusablePre makes a code block focusable, and only when asked', async () => {
    const md = '```bash\necho hi\n```\n'
    expect(await markdownToHtml(md)).toContain('<pre><code')
    expect(await markdownToHtml(md, { focusablePre: true })).toContain('<pre tabindex="0"><code')
  })

  it('absolute turns an image src into a full URL', async () => {
    const md = '![Logo](/images/feilsoking-to-veier-gjennom-tcp-ip-stakken/tcp-ip-stack.svg)\n'
    expect(await markdownToHtml(md)).toContain(
      'src="/images/feilsoking-to-veier-gjennom-tcp-ip-stakken/tcp-ip-stack.svg"',
    )
    expect(await markdownToHtml(md, { absolute: true })).toContain(
      'src="https://rozsoshnykh.no/images/feilsoking-to-veier-gjennom-tcp-ip-stakken/tcp-ip-stack.svg"',
    )
  })
})
