// CSP report storage: at most ONE Analytics Engine point per report POST (blob1 = 'csp').
// Worker-only (AE). Parsing and sanitising the Reporting API body is
// worker/csp.ts parseCspReports (shared with the build). Anyone can POST
// reports, and AE's 100k points/day on Free are shared with the geo/view
// channels — a batch of ten used to cost ten; now only the first own-origin
// violation of a batch is kept. A real breakage still shows: every page view
// that hits it reports it. Read them back with the "Analytics report" workflow.
import { parseCspReports } from '../csp'

export function recordCspReport(env: Env, payload: unknown, origin: string): void {
  const [v] = parseCspReports(payload, origin, 1)
  if (!v) return
  try {
    env.METRICS_AE.writeDataPoint({
      indexes: ['csp'],
      blobs: ['csp', v.directive, v.blocked, v.page],
      doubles: [1],
    })
  } catch {}
}
