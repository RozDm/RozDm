// Contact constants the form and the Worker share: public address, field limits, honeypot name, the email pattern.
// Pure, no DOM and no Workers APIs: the app (form, footer, privacy pages) and worker/domain/contact.ts both import it.
import type { ContactRequest } from '../../worker/api-types'

// The site's public address (the form's fallback, the footer, the privacy
// notice; public/.well-known/security.txt is held to it by a test) — also the
// contact mail's sender. The app imports it from here, so the Worker and the
// pages can't drift apart.
export const CONTACT_ADDRESS = 'contact@rozsoshnykh.no'

export const CONTACT_LIMITS = {
  nameMin: 1,
  name: 100,
  email: 200,
  message: 5000,
  messageMin: 10,
} as const

// The Worker trims a field before it checks its length (worker/validate.ts
// text()), so the form must too: "   " or "a" + 9 spaces would pass the
// browser's `required`/`minLength` (which count spaces) and get a 422.
export function contactFieldLongEnough(field: 'name' | 'message', value: string): boolean {
  return value.trim().length >= (field === 'name' ? CONTACT_LIMITS.nameMin : CONTACT_LIMITS.messageMin)
}

// The contact form's honeypot field, shared by the form and the Worker so the
// two can't drift. Not `website`/`url`/`company`/`phone`-like: autofill and
// password managers fill those, and a filled honeypot silently drops a real
// visitor's message.
export const HONEYPOT_FIELD = 'topic' satisfies keyof ContactRequest

// Loose but practical: something@something.tld. No whitespace and none of
// <>,;"()[]\: — the address lands in `Reply-To: <…>`, and a `>, <…` inside
// it would add a second recipient (CR/LF were already refused).
// Every class character escaped, so the same source also compiles under the
// `v` flag that browsers use for an HTML pattern attribute.
const EMAIL_CHAR = '[^\\s@<>,;"\\(\\)\\[\\]\\\\:]'
// The contact form's `pattern` (the browser anchors it itself): the same rule
// as the Worker's, so the browser refuses what the Worker would 422.
export const EMAIL_PATTERN = `${EMAIL_CHAR}+@${EMAIL_CHAR}+\\.${EMAIL_CHAR}{2,}`
