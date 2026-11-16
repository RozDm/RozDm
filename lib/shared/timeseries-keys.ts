// Bucket-key rules the Trends chart and the Worker share: METRICS_EPOCH and normalizeBucketKey.
// Pure, no DOM and no Workers APIs.

// MUST sit on a 6-hour UTC boundary (00/06/12/18; tests/worker/domain/timeseries.test.ts):
// the filter compares bucket-START keys, so a mid-bucket epoch drops a
// straddling 6h bucket's real visits and the chart undercounts the map (why:
// docs/history.md). Bump it after every `reset-metrics` run, rounding UP to
// the next boundary so no pre-reset noise slips in. Now: the reset of
// 2026-10-22 21:30 UTC, rounded up.
export const METRICS_EPOCH = '2026-10-23 00:00:00'

// Canonicalise a bucket key to the fixed-width UTC form "YYYY-MM-DD HH:MM:SS"
// that both the epoch compare (below) and the client-side merge
// (lib/shared/timeseries-fill.ts `utcBucketKey`) assume. AE currently emits exactly
// that, so today this is a no-op — but the whole pipeline hangs on a raw
// string equality, and an AE-side format drift (ISO 'T' separator, a trailing
// 'Z'/offset, fractional seconds) would silently zero-fill the whole chart
// while the D1-backed map kept working. Normalising here (and again at the
// merge) makes such a drift harmless instead of an invisible outage. A string
// that doesn't look like a datetime (defensive) is returned untouched.
export function normalizeBucketKey(ts: string): string {
  const m = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})/.exec(ts)
  return m ? `${m[1]} ${m[2]}` : ts
}
