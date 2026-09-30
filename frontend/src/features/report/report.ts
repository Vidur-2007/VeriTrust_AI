import type { AuditReport, ReportClaim, TrustBreakdown } from '@/lib/types'

/** The trust score as the lines of its sum (backend/app/scoring.py). */
export function trustLines(b: TrustBreakdown): { label: string; value: string }[] {
  const lines = [{ label: 'Start', value: '100' }]
  if (b.contradicted) lines.push({ label: `Contradicted claims × ${b.contradicted}`, value: String(b.penalties.contradicted) })
  if (b.unsupported) lines.push({ label: `Unsupported claims × ${b.unsupported}`, value: String(b.penalties.unsupported) })
  if (b.retries) lines.push({ label: `Rewrites × ${b.retries}`, value: String(b.penalties.retries) })
  if (b.escalated) lines.push({ label: 'Escalated to a person', value: 'score set to 0' })
  return lines
}

/** Evidence facts that were edited after this answer was given (drift visible in the audit). */
export function changedFacts(r: AuditReport): { factId: string; then: string; now: string | null }[] {
  const seen = new Map<string, { factId: string; then: string; now: string | null }>()
  for (const d of r.drafts) {
    for (const c of d.claims) {
      for (const e of c.evidence) {
        if (e.changed_since && !seen.has(e.fact_id)) {
          seen.set(e.fact_id, { factId: e.fact_id, then: e.statement_at_answer_time, now: e.current_statement })
        }
      }
    }
  }
  return [...seen.values()]
}

/** What the customer ended up receiving, and from whom. */
export function customerOutcome(r: AuditReport): { heading: string; text: string } {
  if (r.review.status === 'resolved' && r.review.reviewer_text) {
    return { heading: 'Reply approved by a reviewer', text: r.review.reviewer_text }
  }
  if (r.decision.status === 'escalated') {
    return { heading: 'Customer got the safe hand-off message', text: r.final_answer }
  }
  return { heading: 'Answer sent to the customer', text: r.final_answer }
}

export function claimFix(c: ReportClaim): string | null {
  return c.verdict === 'supported' ? null : c.rule_note ?? c.correction
}
