import { describe, expect, it } from 'vitest'

import type { EvalModeMetrics, EvalRecord, ModelComparison } from '@/lib/types'
import { badClaims, cellFor, comparisonRows, completeQuestions, matchesFilter, questionRows, signedMs } from './evalView'

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

describe('comparisonRows', () => {
  const mode = (extra: Partial<EvalModeMetrics>): EvalModeMetrics => ({ n: 24, hallucinations: 0, hallucination_rate_pct: 0, latency_ms: { p50: 8000, p95: 30000, n: 24 }, ...extra })
  const side = (modes: ModelComparison['gemini']['metrics']['modes']) => ({ run_id: 1, ts: '2026-09-30T00:00:00Z', model: 'm', metrics: { modes, comparison: {} } })
  const c: ModelComparison = {
    paired_answers: 72, paired_questions: 24, questions: 24, answers: 72, waiting_for_grade: 0, failed: 0, grader: 'gemini',
    gemini: side({ baseline: mode({ hallucination_rate_pct: 25 }), guarded: mode({ false_block_rate_pct: 0, escalation_rate_pct: 0 }), injected: mode({ catch_rate_pct: 95 }) }),
    ollama: side({ baseline: mode({ hallucination_rate_pct: 40 }), guarded: mode({ hallucination_rate_pct: 12.5, false_block_rate_pct: 10, escalation_rate_pct: 0, latency_ms: { p50: 240000, p95: 600000 } }) }),
  }
  const rows = comparisonRows(c)
  const by = (label: string) => rows.find((r) => r.label.startsWith(label))!

  it('marks the better model, where lower is better except for the catch rate', () => {
    expect(by('Wrong answers, no guardrail')).toMatchObject({ gemini: 25, local: 40, better: 'gemini' })
    expect(by('Wrong answers, with guardrail').better).toBe('gemini')
    expect(by('Handed to a person').better).toBe('tie')
    expect(by('Median answer time')).toMatchObject({ unit: 'ms', better: 'gemini' })
    expect(comparisonRows({ ...c, ollama: side({ injected: mode({ catch_rate_pct: 99 }) }) }).find((r) => r.label === 'Injected errors caught')!.better).toBe('local')
  })

  it('leaves a row open when one model has no number yet', () => {
    expect(by('Injected errors caught')).toMatchObject({ gemini: 95, local: null, better: null })
  })
})
