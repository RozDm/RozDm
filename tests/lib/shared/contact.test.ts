import { describe, expect, it } from 'vitest'
import { CONTACT_LIMITS, contactFieldLongEnough } from '@/lib/shared/contact'

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
