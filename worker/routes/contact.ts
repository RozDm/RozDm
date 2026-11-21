// POST /api/contact — HTTP steps of the contact form: body cap, gates, validation, Turnstile, then the store's answer.
// Defence in depth: same-origin + bot-UA + honeypot + a burst cap
// (WRITE_LIMITER) + Turnstile (when configured) + per-IP and per-email rate
// limits (domain/contact-store.ts, in D1).
import type { ApiOk, ContactErrorCode } from '../api-types'
import { allowWrite, apiError, apiJson, readCapped, refuseMethod } from '../http'
import { clientKey } from '../ip'
import { parseJson } from '../validate'
import { HONEYPOT_FIELD } from '../../lib/shared/contact'
import { validateContact, verifyTurnstile } from '../domain/contact'
import { recordHoneypot, submitContact } from '../domain/contact-store'
import { isWriteAllowed } from '../domain/metrics'

// This route refuses only with its own codes (ContactErrorCode); tsc holds it to that.
const refuse: (code: ContactErrorCode) => Response = apiError

// The largest body a real form sends is ~15 KB (5,000 characters of message
// at up to 3 UTF-8 bytes, a Turnstile token, the short fields). A larger
// Content-Length is refused before anything else; the body is read with the
// same cap either way (a client need not send the header).
export const CONTACT_MAX_BODY = 32_768

// The answers (ContactResponse, worker/api-types.ts): the form reads the codes.
const OK = JSON.stringify({ ok: true } satisfies ApiOk)

export async function handleContact(url: URL, request: Request, env: Env): Promise<Response | null> {
  if (url.pathname !== '/api/contact') return null
  const refused = refuseMethod(request, ['POST'])
  if (refused) return refused

  if (Number(request.headers.get('content-length')) > CONTACT_MAX_BODY) return refuse('payload_too_large')
  if (!isWriteAllowed(request.headers, url.origin)) return refuse('forbidden')

  const text = await readCapped(request, CONTACT_MAX_BODY)
  if (text === null) return refuse('payload_too_large')
  const raw = parseJson(text)
  if (raw === undefined) return refuse('bad_request')

  // Honeypot: bots fill every field; pretend success and drop it. The trace
  // is behind the limiter: this runs before the contact burst cap, and a POST
  // loop must not spend AE's shared daily points.
  if ((raw as Record<string, unknown> | null)?.[HONEYPOT_FIELD]) {
    if (await allowWrite(env, request, 'honeypot')) recordHoneypot(env)
    return apiJson(OK)
  }

  const payload = validateContact(raw)
  if (!payload) return refuse('invalid')

  // Burst cap per sender, independent of D1: the store's windows are D1
  // counts, which fail open when D1 errors (and a burst of parallel requests
  // all read the same count before any row lands). Ahead of Turnstile, so a
  // flood doesn't spend siteverify calls.
  if (!(await allowWrite(env, request, 'contact'))) return refuse('rate_limited')

  const ip = request.headers.get('cf-connecting-ip') ?? 'unknown'

  // Turnstile is enforced only when the secret is set, so deploying the code
  // never breaks the form on its own — the dashboard setup activates it.
  if (env.TURNSTILE_SECRET) {
    if (!payload.turnstileToken) return refuse('challenge_required')
    // The widget ran on a page of this host (the form posts same-origin).
    const ok = await verifyTurnstile(payload.turnstileToken, env.TURNSTILE_SECRET, ip, url.hostname)
    if (!ok) return refuse('challenge_failed')
  }

  const outcome = await submitContact(env, payload, clientKey(ip))
  return outcome === 'sent' || outcome === 'duplicate' ? apiJson(OK) : refuse(outcome)
}
