import { describe, expect, it } from 'vitest'
import { buildSeries, headlineTotal, niceCeil, type PlotBox } from '@/lib/shared/trends-series'

const BOX: PlotBox = { padLeft: 40, plotW: 100, plotH: 80, baseline: 92 }
const NOW = Date.UTC(2026, 5, 19, 18, 30) // 2026-06-19 18:30 UTC
const label = (ts: string) => ts

describe('niceCeil', () => {
  it('floors at 1', () => {
    expect(niceCeil(-3)).toBe(1)
    expect(niceCeil(0)).toBe(1)
    expect(niceCeil(1)).toBe(1)
  })

  it('rounds up to 1/2/5 × 10^n and keeps exact steps', () => {
    expect(niceCeil(1.5)).toBe(2)
    expect(niceCeil(2)).toBe(2)
    expect(niceCeil(3)).toBe(5)
    expect(niceCeil(5)).toBe(5)
    expect(niceCeil(5.01)).toBe(10)
    expect(niceCeil(10)).toBe(10)
    expect(niceCeil(11)).toBe(20)
    expect(niceCeil(37)).toBe(50)
    expect(niceCeil(100)).toBe(100)
    expect(niceCeil(101)).toBe(200)
    expect(niceCeil(1000)).toBe(1000)
    expect(niceCeil(6000)).toBe(10000)
  })
})

describe('buildSeries', () => {
  it('draws a dot only for buckets with visits, and none for an empty window', () => {
    const empty = buildSeries([], '24h', NOW, BOX, label)
    expect(empty.dots).toEqual([])
    expect(empty.waveTotal).toBe(0)
    const s = buildSeries([{ ts: '2026-06-19 17:00:00', value: 3 }], '24h', NOW, BOX, label)
    expect(s.dots).toHaveLength(1)
    expect(s.dots[0]).toMatchObject({ ts: '2026-06-19 17:00:00', value: 3 })
  })

  it('spreads the grid across the plot: first bucket at padLeft, last at padLeft + plotW', () => {
    const s = buildSeries(
      [
        { ts: '2026-06-18 18:00:00', value: 1 }, // 24 buckets back: the first of 25
        { ts: '2026-06-19 18:00:00', value: 1 }, // the current bucket: the last
      ],
      '24h',
      NOW,
      BOX,
      label,
    )
    expect(s.dots.map((d) => d.x)).toEqual([BOX.padLeft, BOX.padLeft + BOX.plotW])
    // x ticks span the same width, first to last
    expect(s.tickLabels[0].x).toBe(BOX.padLeft)
    expect(s.tickLabels[s.tickLabels.length - 1].x).toBe(BOX.padLeft + BOX.plotW)
  })

  it('puts the tallest bucket at the top of the plot and a value on the baseline-relative scale', () => {
    const s = buildSeries(
      [
        { ts: '2026-06-19 16:00:00', value: 10 },
        { ts: '2026-06-19 17:00:00', value: 5 },
      ],
      '24h',
      NOW,
      BOX,
      label,
    )
    expect(s.yMax).toBe(10)
    expect(s.dots[0].y).toBe(BOX.baseline - BOX.plotH)
    expect(s.dots[1].y).toBe(BOX.baseline - BOX.plotH / 2)
  })

  it('keeps yMax at 1 or more, rounded to a nice number', () => {
    expect(buildSeries([], '7d', NOW, BOX, label).yMax).toBe(1)
    expect(buildSeries([{ ts: '2026-06-19 17:00:00', value: 37 }], '7d', NOW, BOX, label).yMax).toBe(50)
  })

  it('sums the visible window into waveTotal, ignoring points outside it', () => {
    const s = buildSeries(
      [
        { ts: '2026-06-19 17:00:00', value: 4 },
        { ts: '2026-06-19 12:00:00', value: 6 },
        { ts: '2026-05-01 00:00:00', value: 99 }, // far before the 24h grid
      ],
      '24h',
      NOW,
      BOX,
      label,
    )
    expect(s.waveTotal).toBe(10)
  })

  it('formats ticks through the callback; 24h keeps repeated labels, windows drop them', () => {
    const same = () => 'x'
    expect(buildSeries([], '24h', NOW, BOX, same).tickLabels).toHaveLength(3)
    expect(buildSeries([], '7d', NOW, BOX, same).tickLabels).toHaveLength(1)
  })

  it('flags the capped all-time window only on `all`, once the epoch is out of reach', () => {
    expect(buildSeries([], '30d', NOW, BOX, label).allCapped).toBe(false)
    // far in the future the epoch-to-now span exceeds the cap
    const later = Date.UTC(2100, 0, 1)
    expect(buildSeries([], 'all', later, BOX, label).allCapped).toBe(true)
    expect(buildSeries([], '30d', later, BOX, label).allCapped).toBe(false)
  })
})

describe('headlineTotal', () => {
  it('is the D1 total on `all`, whatever the AE sum is', () => {
    expect(headlineTotal('all', 1234, 7, true)).toBe(1234)
    expect(headlineTotal('all', null, 7, true)).toBeNull()
  })

  it('is the AE window total on windowed ranges, independent of geoTotal', () => {
    expect(headlineTotal('7d', 1234, 7, true)).toBe(7)
    expect(headlineTotal('24h', null, 0, true)).toBe(0)
  })

  it('is null while the window is loading or failed', () => {
    expect(headlineTotal('30d', 1234, 0, false)).toBeNull()
  })
})
