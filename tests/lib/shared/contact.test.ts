import { describe, expect, it } from 'vitest'
import { CONTACT_LIMITS, contactFieldLongEnough, refusedState } from '@/lib/shared/contact'

// The Worker trims before it checks (worker/validate.ts text()); the form's rule must agree.
describe('contactFieldLongEnough', () => {
  it('counts a name after trimming', () => {
    expect(contactFieldLongEnough('name', '')).toBe(false)
    expect(contactFieldLongEnough('name', '   \t ')).toBe(false)
    expect(contactFieldLongEnough('name', ' a ')).toBe(true)
  })

  it('counts a message after trimming, against messageMin', () => {
    expect(CONTACT_LIMITS.messageMin).toBe(10)
    expect(contactFieldLongEnough('message', 'a' + ' '.repeat(9))).toBe(false)
    expect(contactFieldLongEnough('message', ' ' + 'a'.repeat(9) + ' ')).toBe(false)
    expect(contactFieldLongEnough('message', ' ' + 'a'.repeat(10) + ' ')).toBe(true)
  })
})

describe('refusedState', () => {
  it("429 is a rate limit only with the Worker's own code; an edge quota 429 is an error", () => {
    expect(refusedState(429, 'rate_limited', true)).toBe('ratelimited')
    expect(refusedState(429, null, true)).toBe('error')
    expect(refusedState(429, undefined, false)).toBe('error')
  })

  it('422 is invalid', () => {
    expect(refusedState(422, 'invalid', true)).toBe('invalid')
    expect(refusedState(422, null, false)).toBe('invalid')
  })

  it('a Turnstile refusal asks for the challenge only when there is a site key', () => {
    expect(refusedState(403, 'challenge_required', true)).toBe('challenge')
    expect(refusedState(403, 'challenge_failed', true)).toBe('challenge')
    expect(refusedState(403, 'challenge_required', false)).toBe('blocked')
    expect(refusedState(403, 'challenge_failed', false)).toBe('blocked')
  })

  it('other 403s (forbidden, no code) send the visitor to e-mail', () => {
    expect(refusedState(403, 'forbidden', true)).toBe('blocked')
    expect(refusedState(403, null, true)).toBe('blocked')
  })

  it('anything else is a plain error', () => {
    expect(refusedState(502, 'send_failed', true)).toBe('error')
    expect(refusedState(500, null, true)).toBe('error')
    expect(refusedState(413, 'payload_too_large', true)).toBe('error')
  })
})
