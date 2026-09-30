import { describe, expect, it } from 'vitest'

import type { DomainInfo } from '@/lib/types'
import { AIRLINE, examplesFor, injectQuestion } from './domainInfo'

const bank: DomainInfo = {
  id: 'bank', name: 'Golconda Bank', industry: 'Bank', facts: 49, has_site: false,
  categories: [{ id: 'cards', label: 'Cards' }], high_risk: ['cards'], demo_attacks: ['ATK-01'],
  examples: { en: [{ text: 'What is the annual fee for the Platinum debit card?', hint: 'Clean answer' }], inject: 'What is the processing fee on a personal loan?' },
}

describe('domain pack examples', () => {
  it('uses the built-in examples for the airline and the pack\'s own otherwise', () => {
    expect(examplesFor(AIRLINE, 'en')[0].text).toContain('cabin baggage')
    expect(examplesFor(AIRLINE, 'te').length).toBeGreaterThan(0)
    expect(examplesFor(bank, 'en')[0].text).toContain('Platinum debit card')
    expect(examplesFor(bank, 'hi')).toEqual([])  // never the airline's questions for another pack
  })

  it('picks the question to ask with an error injected', () => {
    expect(injectQuestion(AIRLINE)).toContain('refund')
    expect(injectQuestion(bank)).toBe('What is the processing fee on a personal loan?')
    expect(injectQuestion({ ...bank, examples: { en: bank.examples.en } })).toContain('Platinum')
  })
})
