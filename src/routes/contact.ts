// POST /api/contact — validate, Turnstile, rate-limit, store in D1, mail via
// Email Routing. Defence in depth: same-origin + bot-UA + honeypot + a burst
// cap (WRITE_LIMITER) + Turnstile (when configured) + per-IP and per-email
// rate limits.
import { EmailMessage } from 'cloudflare:email'
import { allowWrite, apiJson, readCapped } from '../http'
import { isWriteAllowed } from '../metrics'
import { clientKey } from '../ip'
import {
  CONTACT_ADDRESS,
  CONTACT_WINDOWS_MS,
  HONEYPOT_FIELD,
  buildContactMime,
  isoCutoff,
  validateContact,
  verifyTurnstile,
} from '../contact'

const CONTACT_FROM = CONTACT_ADDRESS
// Max submissions per IP per 10 minutes (casual single-network abuse).
const CONTACT_IP_LIMIT = 3
// Max submissions per e-mail address per hour — spammers reuse a throwaway
// address while rotating IPs, so this catches what the IP gate misses.
const CONTACT_EMAIL_LIMIT = 2
// The largest body a real form sends is ~15 KB (5,000 characters of message
// at up to 3 UTF-8 bytes, a Turnstile token, the short fields). A larger
// Content-Length is refused before anything else; the body is read with the
// same cap either way (a client need not send the header).
export const CONTACT_MAX_BODY = 32_768

export async function handleContact(url: URL, request: Request, env: Env): Promise<Response | null> {
  if (url.pathname !== '/api/contact' || request.method !== 'POST') return null

  if (Number(request.headers.get('content-length')) > CONTACT_MAX_BODY) {
    return apiJson('{"error":"payload too large"}', 413)
  }

  if (!isWriteAllowed(request.headers, url.origin)) {
    return apiJson('{"error":"forbidden"}', 403)
  }

  const text = await readCapped(request, CONTACT_MAX_BODY)
  if (text === null) return apiJson('{"error":"payload too large"}', 413)
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    return apiJson('{"error":"bad request"}', 400)
  }

  // Honeypot: bots fill every field; pretend success and drop it. One AE
  // point per drop (no visitor data), so a false positive — autofill filling
  // the field — shows in the analytics report instead of vanishing. Behind the
  // limiter: this runs before the contact burst cap, and a POST loop must not
  // spend AE's shared daily points.
  if ((raw as Record<string, unknown> | null)?.[HONEYPOT_FIELD]) {
    if (await allowWrite(env, request, 'honeypot')) {
      try {
        env.METRICS_AE.writeDataPoint({ indexes: ['honeypot'], blobs: ['honeypot'], doubles: [1] })
      } catch {
        // Best effort: the ack below doesn't depend on the trace.
      }
    }
    return apiJson('{"ok":true}')
  }

  const payload = validateContact(raw)
  if (!payload) return apiJson('{"error":"invalid"}', 422)

  // Burst cap per sender, independent of D1: the windows below are D1 counts,
  // which fail open when D1 errors (and a burst of parallel requests all read
  // the same count before any row lands). Ahead of Turnstile, so a flood
  // doesn't spend siteverify calls.
  if (!(await allowWrite(env, request, 'contact'))) return apiJson('{"error":"rate limited"}', 429)

  const ip = request.headers.get('cf-connecting-ip') ?? 'unknown'
  // The per-IP window counts a whole IPv6 /64 as one sender (src/ip.ts) — and
  // that prefix, not the full address, is what the row keeps.
  const sender = clientKey(ip)
  // The address the limits and the stored row use: `A@x.no` and `a@x.no` are
  // one mailbox, and as two strings each got its own window. The mail's
  // Reply-To keeps what was typed. Dots and +tags stay: providers differ.
  const emailKey = payload.email.toLowerCase()

  // Turnstile is enforced only when the secret is set, so deploying the code
  // never breaks the form on its own — the dashboard setup activates it.
  if (env.TURNSTILE_SECRET) {
    if (!payload.turnstileToken) {
      return apiJson('{"error":"challenge required"}', 403)
    }
    // The widget ran on a page of this host (the form posts same-origin).
    const ok = await verifyTurnstile(payload.turnstileToken, env.TURNSTILE_SECRET, ip, url.hostname)
    if (!ok) return apiJson('{"error":"challenge failed"}', 403)
  }

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
      // and Turnstile above still stand — but never silently: an unlogged
      // failure would switch the windows off with nothing to show for it.
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
    return limited ? apiJson('{"error":"rate limited"}', 429) : apiJson('{"ok":true}')
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
    return apiJson('{"error":"send failed"}', 502)
  }
  return apiJson('{"ok":true}')
}
