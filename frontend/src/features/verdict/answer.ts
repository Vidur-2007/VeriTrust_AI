import type { Claim, Draft, Language, Status, TimingSpan } from '@/lib/types'

/** What a verified answer needs to be shown: a live ChatResult and a stored interaction both fit. */
export interface VerifiedAnswer {
  status: Status
  final_answer: string
  language: Language
  claims: Claim[]
  drafts: Draft[]
  timings?: { total_ms: number; spans: TimingSpan[] } | null
}

/** Claims the Judge or rules blocked in drafts before the last one: what the guardrail caught. */
export function caughtEarlier(a: VerifiedAnswer): { draft: number; claims: Claim[] }[] {
  return a.drafts.slice(0, -1)
    .map((d) => ({ draft: d.retry + 1, claims: d.claims.filter((c) => c.verdict !== 'supported') }))
    .filter((d) => d.claims.length)
}

/** Claims of the answer that was checked last (the final draft's, with rule-layer flips). */
export function finalClaims(a: VerifiedAnswer): Claim[] {
  return a.drafts[a.drafts.length - 1]?.claims ?? a.claims
}

export function claimCount(a: VerifiedAnswer): number {
  return finalClaims(a).length + caughtEarlier(a).reduce((n, d) => n + d.claims.length, 0)
}
