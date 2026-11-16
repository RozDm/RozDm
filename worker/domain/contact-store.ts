// Contact storage and mail: the one-statement D1 windows + insert, the mail send, the honeypot trace, the daily prune.
// Worker-only (D1, Email Routing, AE). The rules it applies — limits, windows,
// MIME — are contact.ts; the HTTP steps around it are routes/contact.ts.
import { EmailMessage } from 'cloudflare:email'
import { CONTACT_ADDRESS } from '../../lib/shared/contact'
import { CONTACT_WINDOWS_MS, type ContactPayload, buildContactMime, isoCutoff } from './contact'

const CONTACT_FROM = CONTACT_ADDRESS
// Max submissions per IP per 10 minutes (casual single-network abuse).
const CONTACT_IP_LIMIT = 3
// Max submissions per e-mail address per hour — spammers reuse a throwaway
// address while rotating IPs, so this catches what the IP gate misses.
const CONTACT_EMAIL_LIMIT = 2

// 'sent' and 'duplicate' both answer ApiOk (a duplicate is acked unsent).
export type ContactOutcome = 'sent' | 'duplicate' | 'rate_limited' | 'send_failed'

// One AE point per honeypot drop (no visitor data), so a false positive —
// autofill filling the field — shows in the analytics report instead of
// vanishing. Best effort: the ack doesn't depend on the trace.
export function recordHoneypot(env: Env): void {
  try {
    env.METRICS_AE.writeDataPoint({ indexes: ['honeypot'], blobs: ['honeypot'], doubles: [1] })
  } catch {}
}

// Store and mail one validated message. `sender` is clientKey(ip): the per-IP
// window counts a whole IPv6 /64 as one sender (worker/ip.ts) — and that prefix,
// not the full address, is what the row keeps.
export async function submitContact(env: Env, payload: ContactPayload, sender: string): Promise<ContactOutcome> {
  // The address the limits and the stored row use: `A@x.no` and `a@x.no` are
  // one mailbox, and as two strings each got its own window. The mail's
  // Reply-To keeps what was typed. Dots and +tags stay: providers differ.
  const emailKey = payload.email.toLowerCase()

  // The windows, the dedup and the insert are ONE statement: each D1 call
  // costs ~2 ms of CPU in the binding (a cache-missed /api/geo, one D1 read,
  // runs at p50 3 ms vs /api/status's KV read at 1 ms), and four of them took
  // this route to 9–10 ms of Free's 10 (measured 2026-11-16, docs/history.md).
  // One statement is also atomic: parallel bursts no longer all read the
  // same count before any row lands.
  //
  // Cutoffs are ISO strings like `at` itself — see CONTACT_WINDOWS_MS for
  // why comparing against SQLite's datetime('now', …) was wrong.
  //
  // Idempotency: a double-submit (double-click, lost response + retry, browser
  // resend) would otherwise store a second row and send a second e-mail. An
  // identical message from the same address within a short window is the
  // same submission: acked without re-sending. Keyed on content rather than a
  // client token so it needs no schema change and survives a client that
  // forgets to send a key.
  const now = Date.now()
  const at = new Date(now).toISOString()
  const ipCutoff = isoCutoff(now, CONTACT_WINDOWS_MS.perIp)
  const emailCutoff = isoCutoff(now, CONTACT_WINDOWS_MS.perEmail)
  let checked = true
  const row = await env.METRICS.prepare(
    `INSERT INTO contact (at, ip, name, email, message) SELECT ?1, ?2, ?3, ?4, ?5
     WHERE (SELECT COUNT(*) FROM contact WHERE ip = ?2 AND at > ?6) < ${CONTACT_IP_LIMIT}
       AND (SELECT COUNT(*) FROM contact WHERE email = ?4 AND at > ?7) < ${CONTACT_EMAIL_LIMIT}
       AND NOT EXISTS (SELECT 1 FROM contact WHERE email = ?4 AND message = ?5 AND at > ?8)
     RETURNING id`,
  )
    .bind(
      at,
      sender,
      payload.name,
      emailKey,
      payload.message,
      ipCutoff,
      emailCutoff,
      isoCutoff(now, CONTACT_WINDOWS_MS.duplicate),
    )
    .first<{ id: number }>()
    .catch((err) => {
      // Fails open — a D1 hiccup must not close the form, and the burst cap
      // and Turnstile in the route still stand — but never silently: an
      // unlogged failure would switch the windows off with nothing to show.
      console.error('contact: D1 checks and insert failed, sent unchecked', err)
      checked = false
      return null
    })

  // No row and no error: a window is full or it's a duplicate. Which one is
  // a second read, on this rare path only.
  if (!row && checked) {
    const counts = await env.METRICS.prepare(
      `SELECT (SELECT COUNT(*) FROM contact WHERE ip = ?1 AND at > ?2) AS byIp,
              (SELECT COUNT(*) FROM contact WHERE email = ?3 AND at > ?4) AS byEmail`,
    )
      .bind(sender, ipCutoff, emailKey, emailCutoff)
      .first<{ byIp: number; byEmail: number }>()
      .catch((err) => {
        console.error('contact: D1 window read failed', err)
        return null
      })
    // Unknown (the read failed) is answered as limited: nothing was stored or
    // mailed, and the form keeps the text for a retry.
    const limited = !counts || counts.byIp >= CONTACT_IP_LIMIT || counts.byEmail >= CONTACT_EMAIL_LIMIT
    return limited ? 'rate_limited' : 'duplicate'
  }

  try {
    // The owner's inbox is a secret (the repo is public). Unset → the send
    // fails below like any other: logged, a mailfail point, a 502.
    const to = env.OWNER_INBOX
    if (!to) throw new Error('OWNER_INBOX is not set')
    const mime = buildContactMime(CONTACT_FROM, to, payload, at)
    await env.CONTACT_EMAIL.send(new EmailMessage(CONTACT_FROM, to, mime))
  } catch (err) {
    // No address or message in the log line — the visitor's data stays out
    // of Workers Logs; the error itself is what needs noticing.
    console.error('contact: mail send failed', err)
    // …and Workers Logs is a place nobody watches: the AE point is what the
    // watchdog reads (/api/timeseries?metric=mailfail). No visitor data in it.
    env.METRICS_AE.writeDataPoint({ indexes: ['mailfail'], blobs: ['mailfail', 'contact'], doubles: [1] })
    // Un-store the row: a stored-but-unsent row would make the visitor's retry
    // look like a duplicate (the dedup above would ack it with ok:true and never
    // mail it) and would eat into their rate limit. The form keeps its text on
    // an error, so nothing is lost by dropping the row — the retry re-stores it.
    if (row) {
      await env.METRICS.prepare('DELETE FROM contact WHERE id = ?1')
        .bind(row.id)
        .run()
        .catch(() => {})
    }
    return 'send_failed'
  }
  return 'sent'
}

// Daily prune of the contact table. Rate-limit windows are 10 min and 1 hour,
// so anything older is backup-only; 30 days bounds the table without losing
// recent data. Best-effort: a failed prune just delays the next attempt by
// 24 hours. The cutoff is an ISO string like `at` (see CONTACT_WINDOWS_MS).
export async function pruneContactRows(env: Env): Promise<void> {
  await env.METRICS.prepare('DELETE FROM contact WHERE at < ?1')
    .bind(isoCutoff(Date.now(), CONTACT_WINDOWS_MS.retention))
    .run()
    .catch((err) => console.error('prune: contact delete failed', err))
}
