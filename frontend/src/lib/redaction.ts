/** Tokens backend/app/pii.py puts in place of personal data before anything is logged. */
export type RedactedKind = 'PHONE' | 'EMAIL' | 'PNR'

export const REDACTED_LABELS: Record<RedactedKind, { short: string; spoken: string }> = {
  PHONE: { short: 'phone hidden', spoken: 'phone number removed' },
  EMAIL: { short: 'email hidden', spoken: 'email address removed' },
  PNR: { short: 'booking code hidden', spoken: 'booking code removed' },
}

export type RedactedPart = { text: string } | { redacted: RedactedKind }

const TOKEN = /\[(PHONE|EMAIL|PNR)\]/g

/** Split stored text into plain runs and redaction markers. Other [brackets] stay text. */
export function splitRedacted(text: string): RedactedPart[] {
  const parts: RedactedPart[] = []
  let last = 0
  for (const m of text.matchAll(TOKEN)) {
    if (m.index > last) parts.push({ text: text.slice(last, m.index) })
    parts.push({ redacted: m[1] as RedactedKind })
    last = m.index + m[0].length
  }
  if (last < text.length) parts.push({ text: text.slice(last) })
  return parts
}

export function hasRedactions(text: string): boolean {
  return /\[(PHONE|EMAIL|PNR)\]/.test(text)
}
