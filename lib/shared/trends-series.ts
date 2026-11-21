// Pure series math for the Trends chart: zero-filled dots, y ceiling, window total, x ticks, headline choice.
// Pure, no DOM: the component keeps the dictionary strings, Intl formatting and the visit-count threshold
// (lib/client/geo.ts); unit-tested in tests/lib/shared/trends-series.test.ts.
import type { SeriesPoint, SeriesRangeKey } from '../../worker/api-types'
import { fillBuckets, isAllRangeCapped } from './timeseries-fill'
import { dropRepeatedDays, xTicksFor } from './trends-axis'

// Round up to a "nice" number for the y-axis ceiling (1/2/5 * 10^n). Keeps
// tick labels readable instead of "max=37, axis goes to 37".
export function niceCeil(n: number): number {
  if (n <= 1) return 1
  const exp = Math.floor(Math.log10(n))
  const base = Math.pow(10, exp)
  const norm = n / base
  if (norm <= 1) return base
  if (norm <= 2) return 2 * base
  if (norm <= 5) return 5 * base
  return 10 * base
}

export interface Dot {
  x: number
  y: number
  ts: string
  value: number
}

// The plot area inside the SVG, in the SVG's own units: where the first
// bucket sits (padLeft), how wide and tall the plot is, and the y of value 0.
export interface PlotBox {
  padLeft: number
  plotW: number
  plotH: number
  baseline: number
}

export interface TrendsSeries {
  dots: Dot[]
  yMax: number
  waveTotal: number
  tickLabels: { x: number; label: string }[]
  allCapped: boolean
}

// Zero-fills the window so the x-axis spans all of it and quiet stretches
// read as real gaps; only buckets that had visits get a dot. `now` is the
// server's clock (lib/client/server-clock.ts): on a visitor's wrong one the
// grid ended at another hour and the dots fell off it. `formatTick` labels a
// bucket's `ts` for the x-axis (Intl lives in the component).
export function buildSeries(
  points: SeriesPoint[],
  range: SeriesRangeKey,
  now: number,
  box: PlotBox,
  formatTick: (ts: string) => string,
): TrendsSeries {
  const filled = fillBuckets(points, range, now)
  const yMax = niceCeil(Math.max(1, ...filled.map((p) => p.value)))
  const n = filled.length
  const coords: Dot[] = filled.map((p, i) => ({
    x: n === 1 ? box.padLeft + box.plotW / 2 : box.padLeft + (i / (n - 1)) * box.plotW,
    y: box.baseline - (p.value / yMax) * box.plotH,
    ts: p.ts,
    value: p.value,
  }))
  // X ticks come from the full grid so labels span the window even though
  // only non-empty buckets get a dot.
  const ticks = xTicksFor(
    coords,
    (c) => c.x,
    (c) => formatTick(c.ts),
  )
  return {
    dots: coords.filter((c) => c.value > 0),
    yMax,
    // AE's (sampled) sum over the visible window. It's the headline count on
    // the windowed tabs (24t/7d/30d — "visits in this period") and, on the
    // `Alt` tab, only the empty-window vs. empty-dataset signal — there the
    // headline switches to the exact D1 total.
    waveTotal: filled.reduce((sum, p) => sum + p.value, 0),
    tickLabels: range === '24h' ? ticks : dropRepeatedDays(ticks),
    allCapped: range === 'all' && isAllRangeCapped(now),
  }
}

// Headline number: the exact D1 all-time total (= the map) on `all`, else the
// AE count for the selected window; null while the backing data is missing
// (the chart then shows '–', not a dimmed 0).
export function headlineTotal(
  range: SeriesRangeKey,
  geoTotal: number | null,
  waveTotal: number,
  hasSeries: boolean,
): number | null {
  if (range === 'all') return geoTotal
  return hasSeries ? waveTotal : null
}
