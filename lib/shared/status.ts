// Status rules the dashboard and the Worker share: when a snapshot is stale, since when a monitor has been failing.
// Pure, no DOM and no Workers APIs.
import type { HistoryEntry } from '../../src/api-types'

// When a monitor's current outage began, as far as the history shows: the
// time of the first check in its unbroken run of failures up to now, or null
// when its latest check passed (or there is none). `whole`: every check the
// history holds failed, so the outage is older than the window.
export function failingSince(history: HistoryEntry[], name: string): { at: string; whole: boolean } | null {
  let first = history.length
  while (first > 0 && history[first - 1].up?.[name] === false) first--
  if (first === history.length) return null
  return { at: history[first].at, whole: first === 0 }
}

// A snapshot older than this means the checker itself has stopped (cron
// ticks missed in a row, or KV writes failing). The dashboard must then say
// so instead of repeating a frozen "Alle systemer operative" — nothing else
// watches the watcher. An unparseable timestamp counts as stale.
// 20 min, not 15: the cron fires minutes late at times, and 15 cried
// «utdatert» while it was alive (measurement: docs/history.md).
export const STALE_AFTER_MS = 20 * 60_000

export function isStale(updatedAt: string, now: number): boolean {
  const t = Date.parse(updatedAt)
  return !Number.isFinite(t) || now - t > STALE_AFTER_MS
}
