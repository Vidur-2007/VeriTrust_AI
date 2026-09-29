import { describe, expect, it } from 'vitest'

import { highlightValue, restoreBullets, staleNumbers } from '@/features/audit/highlight'
import { scanReducer, toAuditEvent, type ScanState } from '@/features/audit/useAuditScan'
import { bucketSeries, mergePages } from '@/features/dashboard/series'
import { previewStatement } from '@/features/knowledge/statement'
import { axisTicks, layoutWaterfall } from '@/features/verdict/waterfallLayout'
import { formatMs, formatValue } from '@/lib/format'
import { createSSEParser } from '@/lib/sse'
import type { AuditFinding, InteractionSummary, TimeseriesPoint, TimingSpan } from '@/lib/types'

const span = (node: string, attempt: number, offset_ms: number, ms: number, provider: TimingSpan['provider'] = null, cached: boolean | null = null): TimingSpan =>
  ({ node, attempt, offset_ms, ms, provider, cached })

describe('layoutWaterfall', () => {
  it('places spans on one axis and labels retries', () => {
    const { rows, totalMs } = layoutWaterfall([
      span('judge', 1, 130, 44, 'gemini', true),
      span('retrieve_manual', 0, 0, 20),
      span('maker', 0, 20, 80, 'gemini', false),
      span('maker', 1, 100, 30, 'gemini', true),
    ], 200)
    expect(totalMs).toBe(200)
    expect(rows.map((r) => r.label)).toEqual(['Retrieve', 'Maker', 'Maker · retry 1', 'Judge · retry 1'])
    expect(rows[1]).toMatchObject({ leftPct: 10, widthPct: 40, cached: false })
    expect(rows[3]).toMatchObject({ leftPct: 65, widthPct: 22, cached: true })
  })

  it('stretches the axis when a span ends after total_ms', () => {
    expect(layoutWaterfall([span('judge', 0, 90, 30)], 100).totalMs).toBe(120)
  })

  it('picks round axis ticks', () => {
    expect(axisTicks(180)).toEqual([0, 50, 100, 150])
    expect(axisTicks(8000)).toEqual([0, 2000, 4000, 6000, 8000])
  })
})

describe('bucketSeries', () => {
  const point = (minute: string, approved: number, corrected = 0): TimeseriesPoint =>
    ({ minute, total: approved + corrected, approved, corrected, escalated: 0, blocked: corrected, p95_ms: null })

  it('sums minutes into buckets, oldest first', () => {
    const pts = [point('2026-09-29T10:00Z', 1), point('2026-09-29T10:01Z', 2, 1), point('2026-09-29T10:02Z', 0, 3)]
    const b = bucketSeries(pts, 2)
    expect(b).toHaveLength(2)
    expect(b[0]).toMatchObject({ start: '2026-09-29T10:00:00Z', total: 4, approved: 3, corrected: 1 })
    expect(b[1]).toMatchObject({ total: 3, corrected: 3 })
  })

  it('merges the corrected and escalated pages for the Blocked filter', () => {
    const row = (id: number) => ({ id } as InteractionSummary)
    const merged = mergePages([
      { total: 3, limit: 2, offset: 0, items: [row(9), row(4)] },
      { total: 1, limit: 2, offset: 0, items: [row(7)] },
    ], 2)
    expect(merged.items.map((r) => r.id)).toEqual([9, 7])
    expect(merged.total).toBe(4)
  })
})

describe('formatting', () => {
  it('formats fact values with their units', () => {
    expect(formatValue('3000', 'INR')).toBe('₹3,000')
    expect(formatValue('650', 'INR/kg')).toBe('₹650 per kg')
    expect(formatValue('7', 'kg')).toBe('7 kg')
    expect(formatValue('15', '%')).toBe('15%')
    expect(formatValue('allowed', null)).toBe('allowed')
    expect(formatValue('55 x 35 x 25', 'cm')).toBe('55 x 35 x 25 cm')
  })

  it('formats durations', () => {
    expect(formatMs(78)).toBe('78 ms')
    expect(formatMs(4250)).toBe('4.3 s')
    expect(formatMs(48635)).toBe('49 s')
    expect(formatMs(null)).toBe('–')
  })
})

describe('previewStatement', () => {
  it('keeps the number format of the statement', () => {
    expect(previewStatement('A date change costs ₹3,000 per passenger.', '3000', '3500'))
      .toBe('A date change costs ₹3,500 per passenger.')
    expect(previewStatement('Excess baggage is ₹650 per kg.', '650', '700')).toBe('Excess baggage is ₹700 per kg.')
  })

  it('does not touch other numbers that contain the value', () => {
    expect(previewStatement('Up to 7 kg, or 17 kg in business.', '7', '8')).toBe('Up to 8 kg, or 17 kg in business.')
  })

  it('returns null when the value is not in the statement', () => {
    expect(previewStatement('Pets travel in the hold.', '2', '3')).toBeNull()
  })
})

describe('highlightValue', () => {
  it('finds the verified value in the proposed paragraph', () => {
    const parts = highlightValue('Domestic: ₹650 per kg. International: ₹1,650 per kg.', '650')
    expect(parts.filter((p) => p.match).map((p) => p.text)).toEqual(['₹650'])
  })

  it('marks only the stale value in the manual quote', () => {
    const parts = staleNumbers('- Domestic flights: ₹550 per kg for 2 bags.', '650')
    expect(parts.filter((p) => p.match).map((p) => p.text)).toEqual(['₹550'])
  })

  it('puts inline bullets back on their own lines', () => {
    expect(restoreBullets('At the counter: - Domestic: ₹650. - International: ₹1,500.'))
      .toBe('At the counter:\n- Domestic: ₹650.\n- International: ₹1,500.')
  })
})

describe('audit scan', () => {
  const finding = { manual: 'fees.md', fact_id: 'FEE-001' } as AuditFinding
  const start: ScanState = { phase: 'running', total: 0, manuals: [], findings: [] }

  it('marks a manual done when the next one starts, and keeps errors per manual', () => {
    const events = [
      'event: progress\ndata: {"manual":"baggage.md","done":0,"total":3}\n\n',
      'event: progress\ndata: {"manual":"fees.md","done":1,"total":3}\n\n',
      `event: finding\ndata: ${JSON.stringify(finding)}\n\n`,
      'event: error\ndata: {"manual":"fees.md","message":"Gemini rate limit reached."}\n\n',
      'event: progress\ndata: {"manual":"pets.md","done":2,"total":3}\n\n',
    ]
    let s = start
    const parse = createSSEParser((ev, data) => {
      const e = toAuditEvent(ev, data)
      if (e) s = scanReducer(s, e)
    })
    parse(events.join('').slice(0, 50))
    parse(events.join('').slice(50))
    expect(s.total).toBe(3)
    expect(s.manuals.map((m) => m.status)).toEqual(['done', 'error', 'scanning'])
    expect(s.manuals[1].message).toBe('Gemini rate limit reached.')
    expect(s.findings).toHaveLength(1)
  })
})
