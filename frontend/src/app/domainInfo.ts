import { EXAMPLES } from '@/features/console/language'
import { DEMO_SET } from '@/features/redteam/runState'
import { CATEGORY_LABELS } from '@/lib/format'
import type { DomainInfo, Language } from '@/lib/types'

const AIRLINE_CATEGORIES = ['baggage', 'fees', 'refunds', 'cancellations', 'check_in', 'loyalty', 'special_assistance', 'pets']
const AIRLINE_INJECT = 'How long does a refund take if I cancel my flight?'

/** What the UI shows before GET /domains answers, or when the backend is down: the default pack. */
export const AIRLINE: DomainInfo = {
  id: 'airline', name: 'Charminar Airways', industry: 'Airline', facts: 0,
  categories: AIRLINE_CATEGORIES.map((id) => ({ id, label: CATEGORY_LABELS[id] })),
  high_risk: ['fees', 'refunds', 'baggage'], has_site: true, demo_attacks: DEMO_SET, examples: {},
}

export type Example = { text: string; hint: string }

/** Example questions for a language. The airline's are built in; other packs send their own. */
export function examplesFor(d: DomainInfo, language: Language): Example[] {
  const own = d.examples[language]
  if (Array.isArray(own) && own.length) return own
  return d.id === 'airline' ? EXAMPLES[language] : []
}

/** The question the palette asks with an error injected (demo step 3). */
export function injectQuestion(d: DomainInfo): string {
  return typeof d.examples.inject === 'string' ? d.examples.inject : d.id === 'airline' ? AIRLINE_INJECT : examplesFor(d, 'en')[0]?.text ?? ''
}
