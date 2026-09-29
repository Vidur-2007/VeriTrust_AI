import { describe, expect, it } from 'vitest'

import type { EvalRecord } from '@/lib/types'
import { badClaims, cellFor, completeQuestions, matchesFilter, questionRows, signedMs } from './evalView'

const rec = (id: string, mode: EvalRecord['mode'], extra: Partial<EvalRecord> = {}): EvalRecord => ({
  id, mode, type: 'stale_trap', category: 'fees', question: `q ${id}`, status: 'approved', retries: 0, hallucinated: false, ...extra,
})

describe('cellFor', () => {
  it('maps each record to what the customer got', () => {
    expect(cellFor(undefined)).toBe('missing')
    expect(cellFor(rec('E1', 'guarded', { skipped: true, hallucinated: undefined }))).toBe('skipped')
    expect(cellFor(rec('E1', 'baseline', { status: 'unguarded', hallucinated: true }))).toBe('hallucinated')
    expect(cellFor(rec('E1', 'guarded', { status: 'escalated' }))).toBe('escalated')
    expect(cellFor(rec('E1', 'guarded', { status: 'corrected', retries: 1 }))).toBe('corrected')
    expect(cellFor(rec('E1', 'guarded'))).toBe('correct')
  })
})

describe('question rows', () => {
  const records = [
    rec('E10', 'baseline', { hallucinated: true, graded_claims: [{ verdict: 'contradicted', category: 'fees', text_en: 'costs ₹2,500', evidence_fact_ids: ['FEE-001'], caught_by: 'judge' }] }),
    rec('E10', 'guarded', { status: 'corrected', retries: 1, first_draft_blocked: true }),
    rec('E2', 'baseline'),
    rec('E2', 'guarded', { skipped: true }),
  ]
  const rows = questionRows(records)

  it('groups by question in numeric order', () => {
    expect(rows.map((r) => r.id)).toEqual(['E2', 'E10'])
    expect(Object.keys(rows[1].modes)).toEqual(['baseline', 'guarded'])
  })

  it('filters and counts complete questions', () => {
    expect(rows.filter((r) => matchesFilter(r, 'hallucinated')).map((r) => r.id)).toEqual(['E10'])
    expect(rows.filter((r) => matchesFilter(r, 'blocked')).map((r) => r.id)).toEqual(['E10'])
    expect(rows.filter((r) => matchesFilter(r, 'skipped')).map((r) => r.id)).toEqual(['E2'])
    expect(completeQuestions(rows, ['baseline', 'guarded'])).toBe(1)
  })

  it('explains a wrong answer with its bad claims', () => {
    expect(badClaims(records[0])).toEqual(['contradicted: costs ₹2,500'])
  })
})

describe('signedMs', () => {
  it('formats a latency difference with its sign', () => {
    expect(signedMs(3200)).toEqual({ value: 3.2, prefix: '+', suffix: ' s', decimals: 1 })
    expect(signedMs(-120)).toEqual({ value: 120, prefix: '−', suffix: ' ms', decimals: 0 })
    expect(signedMs(null).value).toBeNull()
  })
})
