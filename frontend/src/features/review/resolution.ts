import { finalClaims } from '@/features/verdict/answer'
import type { Claim, Fact, FactCategory, Interaction, NewFactBody, ReviewResolution } from '@/lib/types'

/** The airline pack's categories; other packs pass their own (see useDomain). */
export const FACT_CATEGORIES: FactCategory[] = [
  'baggage', 'fees', 'refunds', 'cancellations', 'check_in', 'loyalty', 'special_assistance', 'pets',
]

/** Why a case is in the queue. */
export function reason(i: Interaction): 'operator' | 'guardrail' {
  return i.input_flags.includes('sent_to_review') ? 'operator' : 'guardrail'
}

/** The claims that stopped the last draft (what the reviewer has to decide about). */
export function blockedClaims(i: Interaction): Claim[] {
  return finalClaims(i).filter((c) => c.verdict !== 'supported')
}

export function lastDraft(i: Interaction): string {
  return i.drafts[i.drafts.length - 1]?.text ?? ''
}

/** The last draft states something a verified fact contradicts: sending it as is would be wrong. */
export function draftIsWrong(i: Interaction): boolean {
  return blockedClaims(i).some((c) => c.verdict === 'contradicted')
}

/**
 * The last draft with each contradicted claim replaced by the Judge's correction (where the
 * claim's text is found in the draft), as the starting point for a written reply.
 */
export function correctedDraft(i: Interaction): string {
  let text = lastDraft(i)
  for (const c of blockedClaims(i)) {
    if (c.verdict !== 'contradicted' || !c.correction) continue
    const span = c.span_start !== null && c.span_end !== null ? text.slice(c.span_start, c.span_end) : ''
    const target = span && span === c.text ? span : c.text
    if (text.includes(target)) text = text.replace(target, c.correction.replace(/[.]$/, ''))
  }
  return text
}

export interface FactForm {
  /** 'new' adds a fact (id assigned by the server); 'update' changes `id`. */
  mode: 'new' | 'update'
  id?: string
  category: FactCategory
  subject: string
  attribute: string
  value: string
  unit: string
  statement: string
}

/**
 * Pre-fill "save as a verified fact" from the first blocked claim. When the Judge cited a fact
 * (a contradicted value), the default is to update that fact; otherwise it is a new fact, which
 * is the missing-fact case: the statement comes from the blocked claims, the rest is typed.
 */
export function factDraft(i: Interaction, facts: Fact[], categories: FactCategory[] = FACT_CATEGORIES): FactForm {
  const blocked = blockedClaims(i)
  const first = blocked[0]
  const cited = first?.evidence_fact_ids.map((id) => facts.find((f) => f.id === id)).find(Boolean)
  if (cited && first?.verdict === 'contradicted') {
    return {
      mode: 'update', id: cited.id, category: cited.category, subject: cited.subject,
      attribute: cited.attribute, value: cited.value, unit: cited.unit ?? '', statement: cited.statement,
    }
  }
  const category = first && categories.includes(first.category) ? first.category : categories[0]
  const number = first?.text_en.match(/\d[\d,]*(?:\.\d+)?/)?.[0]?.replace(/,/g, '') ?? ''
  return {
    mode: 'new', category, subject: '', attribute: '', value: number, unit: '',
    statement: blocked.map((c) => c.text_en.trim().replace(/[.]?$/, '.')).join(' '),
  }
}

export function factMissing(f: FactForm): string[] {
  const missing: string[] = []
  if (!f.subject.trim()) missing.push('subject')
  if (!f.attribute.trim()) missing.push('attribute')
  if (!f.value.trim()) missing.push('value')
  if (!f.statement.trim()) missing.push('statement')
  return missing
}

/** The POST /review/{id} body for the reviewer's choices. */
export function resolutionBody(opts: {
  reply: 'draft' | 'written'
  text: string
  saveFact: boolean
  fact: FactForm
}): ReviewResolution {
  const body: ReviewResolution = opts.reply === 'draft' ? { action: 'approve' } : { action: 'edit', text: opts.text.trim() }
  if (opts.saveFact) {
    const f = opts.fact
    const fact: NewFactBody = {
      category: f.category, subject: f.subject.trim(), attribute: f.attribute.trim(), value: f.value.trim(),
      unit: f.unit.trim() || null, statement: f.statement.trim(),
    }
    if (f.mode === 'update' && f.id) fact.id = f.id
    body.save_as_fact = fact
  }
  return body
}
