import { describe, expect, it } from 'vitest'
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, statSync } from 'node:fs'

// The repo is public: the owner's personal mailbox lives only in the
// OWNER_INBOX secret. Any personal (Gmail) address in a tracked text file —
// code, docs, tests, fixtures — fails the build.
const PERSONAL = /[\w.+-]+@gmail\.com/i

describe('tracked files', () => {
  it('contain no Gmail address', () => {
    const files = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' })
      .split('\0')
      .filter((f) => f && f !== 'package-lock.json' && existsSync(f) && statSync(f).isFile())
    const hits: string[] = []
    for (const f of files) {
      const buf = readFileSync(f)
      if (buf.subarray(0, 8000).includes(0)) continue // binary
      if (PERSONAL.test(buf.toString('utf8'))) hits.push(f)
    }
    expect(hits).toEqual([])
  })
})
