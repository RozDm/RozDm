// Contact rules (pure): validation, Turnstile verify, MIME for contact and status-alert mail.
// The limits, address, honeypot field and email pattern the form shares:
// lib/shared/contact.ts. D1 and the mail binding: contact-store.ts.
import type { ContactRequest } from '../api-types'
import { CONTACT_LIMITS, EMAIL_PATTERN } from '../../lib/shared/contact'
import { SITE_HOST } from '../../lib/shared/site'
import { object, text } from '../validate'

// Time windows over the contact table, applied as ISO cutoffs bound into SQL
// (isoCutoff) against the ISO `at` column — never SQLite's datetime('now', …),
// whose "YYYY-MM-DD HH:MM:SS" mis-compares with ISO as TEXT and turned every
// window into "today" (docs/history.md, 2026-10-04). ISO against ISO keeps
// the windows exact and the (ip, at) / (email, at) indexes usable.
export const CONTACT_WINDOWS_MS = {
  perIp: 10 * 60_000,
  perEmail: 60 * 60_000,
  duplicate: 2 * 60_000,
  retention: 30 * 86_400_000,
} as const

// The daily prune of rows older than `retention` (the privacy notice promises
// 30 days). scheduled() in index.ts tells it from the 5-minute health cron by
// this pattern, so it must stay one of wrangler.jsonc's crons — a test holds
// the two equal (else 03:00 runs a health check and nothing is ever pruned).
export const CONTACT_PRUNE_CRON = '0 3 * * *'

export function isoCutoff(nowMs: number, windowMs: number): string {
  return new Date(nowMs - windowMs).toISOString()
}

// The validated message (the wire body is ContactRequest, worker/api-types.ts).
export type ContactPayload = Pick<ContactRequest, 'name' | 'email' | 'message'>

export interface ContactInput extends ContactPayload {
  turnstileToken: string | null
}

const EMAIL_RE = new RegExp(`^${EMAIL_PATTERN}$`)

const contactFields = object({
  name: text({ max: CONTACT_LIMITS.name }),
  email: text({ max: CONTACT_LIMITS.email, pattern: EMAIL_RE }),
  message: text({ min: CONTACT_LIMITS.messageMin, max: CONTACT_LIMITS.message }),
})
// Any non-empty string, as sent; anything else reads as no token.
const turnstileTokenField = text({ max: Infinity, trim: false })

// The wire body (ContactRequest) trimmed and checked, or null (a 422).
export function validateContact(input: unknown): ContactInput | null {
  const fields = contactFields(input)
  if (!fields) return null
  return { ...fields, turnstileToken: turnstileTokenField((input as Record<string, unknown>).turnstileToken) }
}

// A hung siteverify must not hold the form open; past this it fails closed.
export const TURNSTILE_TIMEOUT_MS = 5_000

// Cloudflare Turnstile siteverify. Returns true on a valid token, false
// otherwise (or on transport failure or timeout — fail closed). The
// `remoteip` is the visitor's IP for the audit trail; with `hostname`, the
// token must also have been solved on that host (siteverify reports where),
// so a token minted on another site using our site key doesn't pass.
export async function verifyTurnstile(
  token: string,
  secret: string,
  remoteip?: string,
  hostname?: string,
): Promise<boolean> {
  const body = new URLSearchParams({ secret, response: token })
  if (remoteip) body.set('remoteip', remoteip)
  try {
    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      body,
      signal: AbortSignal.timeout(TURNSTILE_TIMEOUT_MS),
    })
    if (!res.ok) return false
    const data = (await res.json()) as { success?: boolean; hostname?: string }
    return data.success === true && (hostname === undefined || data.hostname === hostname)
  } catch {
    return false
  }
}

// Bytes → a binary string in 32 KB slices, not one char at a time: a 5,000-
// character message is ~6 KB, and the per-byte loop cost ~1 ms of CPU on a
// cold isolate (where every contact POST lands) vs ~0.2 ms (measured).
function base64Utf8(text: string): string {
  const bytes = new TextEncoder().encode(text)
  let binary = ''
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  }
  return btoa(binary)
}

// RFC 5322 requires a Date header and wants a Message-ID; both are set here
// rather than left to the relay to fill in. The id's domain is the sender's.
export function rfc5322Date(iso: string): string {
  return new Date(iso).toUTCString().replace(/GMT$/, '+0000')
}

function messageIdHeaders(from: string, at: string): string[] {
  const domain = from.slice(from.lastIndexOf('@') + 1)
  return [`Date: ${rfc5322Date(at)}`, `Message-ID: <${crypto.randomUUID()}@${domain}>`]
}

// RFC 2047 encoded-word so non-ASCII subjects survive SMTP.
// RFC 2047: an encoded-word is at most 75 chars and a header line at most 76.
// 39 UTF-8 bytes → 52 base64 chars → a 64-char word, so `Subject: ` + one
// word fits a line. Chunks never split a code point; words are folded.
const MIME_WORD_BYTES = 39

export function encodeMimeHeader(text: string): string {
  if (/^[\x20-\x7e]*$/.test(text)) return text
  const encoder = new TextEncoder()
  const chunks: string[] = []
  let chunk = ''
  let size = 0
  for (const char of text) {
    const n = encoder.encode(char).length
    if (size + n > MIME_WORD_BYTES && chunk) {
      chunks.push(chunk)
      chunk = ''
      size = 0
    }
    chunk += char
    size += n
  }
  if (chunk) chunks.push(chunk)
  return chunks.map((c) => `=?utf-8?B?${base64Utf8(c)}?=`).join('\r\n ')
}

// Minimal raw MIME message: plain text, base64-encoded body so UTF-8 is safe.
export function buildContactMime(from: string, to: string, payload: ContactPayload, at: string): string {
  const subject = encodeMimeHeader(`Ny melding fra ${payload.name} (${SITE_HOST})`)
  const body = base64Utf8(`Navn: ${payload.name}\nE-post: ${payload.email}\nTidspunkt: ${at}\n\n${payload.message}\n`)
  // 76-char lines per RFC 2045.
  const wrapped = body.replace(/(.{76})/g, '$1\r\n')
  return [
    `From: Kontaktskjema <${from}>`,
    `To: <${to}>`,
    ...messageIdHeaders(from, at),
    `Reply-To: <${payload.email}>`,
    `Subject: ${subject}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=utf-8',
    'Content-Transfer-Encoding: base64',
    '',
    wrapped,
  ].join('\r\n')
}

// Plain-text alert for an uptime-monitor state change. No Reply-To (no human
// on the other end), short fixed body so the inbox is greppable. Reuses the
// same base64 + RFC 2047 encoding as the contact mail so Email Routing handles
// the two identically.
export function buildStatusAlertMime(
  from: string,
  to: string,
  monitor: { name: string; url: string; ok: boolean; status: number; ms: number },
  at: string,
): string {
  const subject = encodeMimeHeader(
    monitor.ok ? `Status: ${monitor.name} er oppe igjen` : `Status: ${monitor.name} er nede`,
  )
  const body = base64Utf8(
    `Tjeneste: ${monitor.name}\nURL: ${monitor.url}\nTidspunkt: ${at}\nHTTP: ${monitor.status}\nLatens: ${monitor.ms} ms\nStatus: ${monitor.ok ? 'OK' : 'NEDE'}\n`,
  )
  const wrapped = body.replace(/(.{76})/g, '$1\r\n')
  return [
    `From: Status <${from}>`,
    `To: <${to}>`,
    ...messageIdHeaders(from, at),
    `Subject: ${subject}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=utf-8',
    'Content-Transfer-Encoding: base64',
    '',
    wrapped,
  ].join('\r\n')
}
