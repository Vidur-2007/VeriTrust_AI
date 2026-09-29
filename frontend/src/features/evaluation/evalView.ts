import type { EvalMode, EvalQuestionType, EvalRecord } from '@/lib/types'

export const MODES: EvalMode[] = ['baseline', 'guarded', 'injected']

export const MODE_LABELS: Record<EvalMode, { label: string; help: string }> = {
  baseline: { label: 'Baseline', help: 'The Maker alone: a plain support bot answering from the manuals.' },
  guarded: { label: 'Guarded', help: 'The full guardrail: Maker, Judge, rules, rewrite or hand-off.' },
  injected: { label: 'Injected', help: 'The full guardrail with one false detail planted in each first draft.' },
}

export const TYPE_LABELS: Record<EvalQuestionType, string> = {
  answerable: 'Answerable',
  stale_trap: 'Stale trap',
  adversarial: 'Adversarial',
  out_of_scope: 'Out of scope',
}

export const TYPE_ORDER: EvalQuestionType[] = ['answerable', 'stale_trap', 'adversarial', 'out_of_scope']

/** What the customer ended up with in one mode. */
export type CellKind = 'correct' | 'corrected' | 'escalated' | 'hallucinated' | 'skipped' | 'missing'

export function cellFor(r: EvalRecord | undefined): CellKind {
  if (!r) return 'missing'
  if (r.skipped) return 'skipped'
  if (r.hallucinated) return 'hallucinated'
  if (r.status === 'escalated') return 'escalated'
  if ((r.retries ?? 0) > 0) return 'corrected'
  return 'correct'
}

export interface QuestionRow {
  id: string
  type: EvalQuestionType
  category: string
  question: string
  modes: Partial<Record<EvalMode, EvalRecord>>
}

/** One row per question with its result in each mode, in question order (E01, E02 …). */
export function questionRows(records: EvalRecord[]): QuestionRow[] {
  const rows = new Map<string, QuestionRow>()
  for (const r of records) {
    const row = rows.get(r.id) ?? { id: r.id, type: r.type, category: r.category, question: r.question, modes: {} }
    row.modes[r.mode] = r
    rows.set(r.id, row)
  }
  return [...rows.values()].sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }))
}

export type QuestionFilter = 'all' | 'hallucinated' | 'blocked' | 'skipped'

export function matchesFilter(row: QuestionRow, f: QuestionFilter): boolean {
  const recs = Object.values(row.modes)
  if (f === 'hallucinated') return recs.some((r) => r.hallucinated)
  if (f === 'blocked') return recs.some((r) => r.first_draft_blocked)
  if (f === 'skipped') return recs.some((r) => r.skipped)
  return true
}

/** Questions with a scored (not skipped) result in every mode of the run. */
export function completeQuestions(rows: QuestionRow[], modes: EvalMode[]): number {
  return rows.filter((row) => modes.every((m) => row.modes[m] && !row.modes[m]!.skipped)).length
}

/** The claims that made an answer count as wrong, in English. */
export function badClaims(r: EvalRecord): string[] {
  return (r.graded_claims ?? []).filter((c) => c.verdict !== 'supported').map((c) => `${c.verdict}: ${c.text_en}`)
}

export function errorText(e: EvalRecord['error']): string {
  if (!e) return ''
  return typeof e === 'string' ? e : e.message
}

/** "+3.2 s" / "−120 ms" for a latency difference. */
export function signedMs(ms: number | null | undefined): { value: number | null; prefix: string; suffix: string; decimals: number } {
  if (ms === null || ms === undefined) return { value: null, prefix: '', suffix: '', decimals: 0 }
  const sign = ms < 0 ? '−' : '+'
  const abs = Math.abs(ms)
  return abs >= 1000
    ? { value: abs / 1000, prefix: sign, suffix: ' s', decimals: 1 }
    : { value: abs, prefix: sign, suffix: ' ms', decimals: 0 }
}
