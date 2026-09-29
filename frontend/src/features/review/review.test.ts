import { describe, expect, it } from 'vitest'

import type { Claim, Fact, Interaction } from '@/lib/types'
import { blockedClaims, correctedDraft, draftIsWrong, factDraft, factMissing, reason, resolutionBody } from './resolution'

const claim = (verdict: Claim['verdict'], text_en: string, category = 'baggage', ids: string[] = []): Claim => ({
  text: text_en, text_en, category, verdict, evidence_fact_ids: ids, correction: null, span_start: null, span_end: null,
  caught_by: 'judge', rule_note: null, evidence: [], manual_section: null,
})

const caseWith = (claims: Claim[], flags: string[] = []): Interaction => ({
  id: 886, ts: 't', channel: 'console', question: 'Can I bring my guitar on the plane?', language: 'en',
  status: 'escalated', final_answer: 'hand-off', claims: [], retries: 0, trust_score: 0, injected: false,
  attack_id: null, input_flags: flags, strictness: 'balanced', review_status: 'pending', reviewer_text: null,
  timings: null, drafts: [{ retry: 0, text: 'You may carry a guitar in the cabin.', claims, injected_detail: null }],
})

const REF001 = { id: 'REF-001', category: 'refunds', subject: 'refund processing', attribute: 'processing time', value: '7', unit: 'working days', statement: 'Refunds are processed within 7 working days.' } as Fact

describe('review case', () => {
  it('knows why a case is waiting and which claims blocked it', () => {
    const c = caseWith([claim('supported', 'ok'), claim('unsupported', 'Guitars may go in the cabin')])
    expect(reason(c)).toBe('guardrail')
    expect(reason(caseWith([], ['sent_to_review']))).toBe('operator')
    expect(blockedClaims(c).map((x) => x.text_en)).toEqual(['Guitars may go in the cabin'])
  })

  it('pre-fills a new fact from unsupported claims (the missing fact)', () => {
    const f = factDraft(caseWith([
      claim('unsupported', 'You may carry a small musical instrument in the cabin in place of your cabin bag'),
      claim('unsupported', 'It must fit in the overhead bin.'),
    ]), [REF001])
    expect(f).toMatchObject({ mode: 'new', category: 'baggage', subject: '', value: '' })
    expect(f.statement).toBe('You may carry a small musical instrument in the cabin in place of your cabin bag. It must fit in the overhead bin.')
    expect(factMissing(f)).toEqual(['subject', 'attribute', 'value'])
  })

  it('flags a wrong draft and applies the corrections for the written reply', () => {
    const wrongClaim = { ...claim('contradicted', 'processed within 9 working days', 'refunds', ['REF-001']), correction: 'processed within 7 working days.' }
    const c = caseWith([wrongClaim])
    c.drafts[0].text = 'Refunds are processed within 9 working days of the cancellation.'
    expect(draftIsWrong(c)).toBe(true)
    expect(correctedDraft(c)).toBe('Refunds are processed within 7 working days of the cancellation.')
    expect(draftIsWrong(caseWith([claim('unsupported', 'Guitars may go in the cabin')]))).toBe(false)
  })

  it('pre-fills an update of the cited fact for a contradicted value', () => {
    const f = factDraft(caseWith([claim('contradicted', 'Refunds take 9 working days', 'refunds', ['REF-001'])]), [REF001])
    expect(f).toMatchObject({ mode: 'update', id: 'REF-001', value: '7', unit: 'working days' })
  })
})

describe('resolutionBody', () => {
  const fact = { mode: 'new' as const, category: 'baggage' as const, subject: ' musical instruments ', attribute: 'in the cabin', value: 'allowed', unit: '', statement: 'A guitar may go in the cabin.' }
  it('approves the last draft, or sends an edited reply', () => {
    expect(resolutionBody({ reply: 'draft', text: 'x', saveFact: false, fact })).toEqual({ action: 'approve' })
    expect(resolutionBody({ reply: 'written', text: ' Hi ', saveFact: false, fact })).toEqual({ action: 'edit', text: 'Hi' })
  })
  it('adds the fact: new facts get no id, updates keep theirs', () => {
    expect(resolutionBody({ reply: 'draft', text: '', saveFact: true, fact }).save_as_fact).toEqual({
      category: 'baggage', subject: 'musical instruments', attribute: 'in the cabin', value: 'allowed', unit: null, statement: 'A guitar may go in the cabin.',
    })
    expect(resolutionBody({ reply: 'draft', text: '', saveFact: true, fact: { ...fact, mode: 'update', id: 'BAG-001' } }).save_as_fact?.id).toBe('BAG-001')
  })
})
