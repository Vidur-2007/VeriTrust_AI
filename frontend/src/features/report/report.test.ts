import { describe, expect, it } from 'vitest'

import { exportFileName, exportLink, isoMinutesAgo } from '@/features/dashboard/exportLink'
import { hasRedactions, splitRedacted } from '@/lib/redaction'
import type { AuditReport, ReportClaim } from '@/lib/types'
import { changedFacts, claimFix, customerOutcome, trustLines } from './report'

describe('splitRedacted', () => {
  it('turns the redaction tokens into markers and keeps other brackets as text', () => {
    expect(splitRedacted('Call [PHONE] about [PNR] [note]')).toEqual([
      { text: 'Call ' }, { redacted: 'PHONE' }, { text: ' about ' }, { redacted: 'PNR' }, { text: ' [note]' },
    ])
    expect(splitRedacted('[EMAIL]')).toEqual([{ redacted: 'EMAIL' }])
    expect(splitRedacted('No personal data.')).toEqual([{ text: 'No personal data.' }])
    expect(hasRedactions('mail [EMAIL]')).toBe(true)
    expect(hasRedactions('[email]')).toBe(false)
  })
})

describe('exportLink', () => {
  const now = Date.parse('2026-09-30T12:00:00.000Z')
  it('adds only the filters that were chosen', () => {
    expect(exportLink('csv', { range: 'all', channel: 'all', status: 'all' }, now)).toBe('/api/export/interactions.csv')
    expect(exportLink('json', { range: 'hour', channel: 'site', status: 'escalated' }, now))
      .toBe('/api/export/interactions.json?channel=site&status=escalated&since=2026-09-30T11%3A00%3A00.000Z')
    expect(isoMinutesAgo(1440, now)).toBe('2026-09-29T12:00:00.000Z')
    expect(exportFileName('csv', { range: 'day', channel: 'console', status: 'corrected' })).toBe('interactions-console-corrected-24h.csv')
  })
})

const claim = (over: Partial<ReportClaim>): ReportClaim => ({
  text: 'x', text_en: 'x', category: 'fees', verdict: 'supported', correction: null, caught_by: 'judge', rule_note: null,
  manual_section: null, span_start: null, span_end: null, evidence: [], ...over,
})

const report = (over: Partial<AuditReport> = {}): AuditReport => ({
  interaction: {} as AuditReport['interaction'], question: 'q', final_answer: 'a', drafts: [],
  decision: { status: 'corrected', retries: 1, strictness: 'balanced', input_flags: [], explanation: null },
  trust: { score: 90, breakdown: { base: 100, contradicted: 0, unsupported: 0, retries: 1, penalties: { contradicted: 0, unsupported: 0, retries: -10 }, escalated: false } },
  timings: { total_ms: 1, nodes: {}, spans: [] }, review: { status: 'none', reviewer_text: null }, pii_redacted: false, ...over,
})

describe('report helpers', () => {
  it('writes the trust score as its sum', () => {
    expect(trustLines(report().trust.breakdown)).toEqual([{ label: 'Start', value: '100' }, { label: 'Rewrites × 1', value: '-10' }])
  })

  it('lists facts that changed after the answer, once each', () => {
    const e = { fact_id: 'FEE-001', statement_at_answer_time: 'costs ₹3,000', current_value: '3500', current_statement: 'costs ₹3,500', changed_since: true }
    const r = report({ drafts: [
      { retry: 0, text: 'd1', injected_detail: null, claims: [claim({ evidence: [e] })] },
      { retry: 1, text: 'd2', injected_detail: null, claims: [claim({ evidence: [e] })] },
    ] })
    expect(changedFacts(r)).toEqual([{ factId: 'FEE-001', then: 'costs ₹3,000', now: 'costs ₹3,500' }])
  })

  it('says what the customer received', () => {
    expect(customerOutcome(report()).heading).toBe('Answer sent to the customer')
    expect(customerOutcome(report({ decision: { ...report().decision, status: 'escalated' } })).heading).toBe('Customer got the safe hand-off message')
    expect(customerOutcome(report({ review: { status: 'resolved', reviewer_text: 'Fixed reply' } }))).toEqual({ heading: 'Reply approved by a reviewer', text: 'Fixed reply' })
    expect(claimFix(claim({ verdict: 'contradicted', correction: '7 days', rule_note: null }))).toBe('7 days')
    expect(claimFix(claim({}))).toBeNull()
  })
})
