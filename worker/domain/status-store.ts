// Uptime storage: the 5-minute cron's probes, KV snapshot write and alert mails, and the snapshot read for /api/status.
// Worker-only (KV, Email Routing, AE). The pure rules — monitor list,
// snapshot merge, flap damping — are status.ts. KV `STATUS` is written here
// by the cron alone: NEVER a per-request KV write (Free: 1000/day).
import { EmailMessage } from 'cloudflare:email'
import { buildStatusAlertMime } from './contact'
import { MONITOR_TIMEOUT_MS, STATUS_KEY, buildStatusData, detectTransitions, monitors, parseHistory } from './status'

const STATUS_ALERT_FROM = 'status@rozsoshnykh.no'

// The cron's snapshot as stored (StatusData JSON), or null when KV has none
// or the read failed — logged, not thrown: the route answers "no data yet".
export async function readStatusSnapshot(env: Env): Promise<string | null> {
  try {
    return (await env.STATUS.get(STATUS_KEY)) || null
  } catch (err) {
    console.error('status: KV read failed', err)
    return null
  }
}

// Cron: ping each monitor, record latency/status, append to rolling history.
export async function runHealthChecks(env: Env): Promise<void> {
  // A failed read is not "no snapshot yet": building on it would replace the
  // 149-check history with this one tick and forget which outages were
  // already mailed (a second «nede» for the same outage). Skip the tick — a
  // snapshot that stays unwritten goes stale on the dashboard and fails the
  // watchdog, which is the true signal.
  let raw: string | null
  try {
    raw = await env.STATUS.get(STATUS_KEY)
  } catch (err) {
    console.error('status: KV read failed, tick skipped', err)
    return
  }

  const results = await Promise.all(
    monitors(env).map(async (monitor) => {
      const start = Date.now()
      let ok = false
      let status = 0
      try {
        const res = await fetch(monitor.url, {
          method: 'GET',
          // Follow redirects (NetBox sends / to /login/) and require a
          // clean 200 on the final response — 3xx/4xx/5xx count as down.
          redirect: 'follow',
          // Bound the probe so a hung host is recorded as down, not waited on.
          signal: AbortSignal.timeout(MONITOR_TIMEOUT_MS),
          headers: {
            'User-Agent': 'StatusMonitor/1.0 (+https://rozsoshnykh.no/status)',
          },
        })
        status = res.status
        ok = res.status === 200
        // Only the status matters: drop the page instead of leaving its
        // stream open until the isolate collects it.
        res.body?.cancel().catch(() => {})
      } catch {
        ok = false
      }
      return { name: monitor.name, url: monitor.url, ok, status, ms: Date.now() - start }
    }),
  )

  const previousHistory = parseHistory(raw)
  const transitions = detectTransitions(previousHistory, results)
  const updatedAt = new Date().toISOString()
  const data = buildStatusData(previousHistory, results, updatedAt)
  // The alert mails below wait for this write: "already mailed" lives in the
  // snapshot, so a mail without it would repeat on every tick until KV takes
  // a write again. Held, the mail goes out on the first tick that is stored;
  // an outage that starts and ends inside the KV failure is never mailed. The
  // watchdog sees the snapshot go stale either way.
  try {
    await env.STATUS.put(STATUS_KEY, JSON.stringify(data))
  } catch (err) {
    console.error('status: KV write failed, alerts held', err)
    return
  }

  for (const t of transitions) {
    try {
      // A secret (the repo is public); unset → a failed send below, so the
      // watchdog goes red instead of the alerts vanishing silently.
      const to = env.OWNER_INBOX
      if (!to) throw new Error('OWNER_INBOX is not set')
      const mime = buildStatusAlertMime(STATUS_ALERT_FROM, to, t, updatedAt)
      await env.CONTACT_EMAIL.send(new EmailMessage(STATUS_ALERT_FROM, to, mime))
    } catch (err) {
      // Alerting is best-effort: a send failure must not stop the status
      // snapshot from being written or block subsequent transitions — but
      // it must show up in Workers Logs, or a dead alert path goes unnoticed.
      console.error('status: alert mail failed', t.name, err)
      // What the watchdog reads (/api/timeseries?metric=mailfail).
      env.METRICS_AE.writeDataPoint({ indexes: ['mailfail'], blobs: ['mailfail', 'status'], doubles: [1] })
    }
  }
}
