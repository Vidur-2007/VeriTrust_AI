import type { TimingSpan } from '@/lib/types'

export const NODE_LABELS: Record<string, string> = {
  guard_input: 'Input guard',
  retrieve_manual: 'Retrieve',
  maker: 'Maker',
  judge: 'Judge',
  rule_check: 'Rules',
  decide: 'Decide',
  fallback: 'Hand-off',
}

export interface WaterfallRow {
  key: string
  label: string
  node: string
  attempt: number
  ms: number
  offsetMs: number
  /** Position on the shared 0..total axis, in percent. */
  leftPct: number
  widthPct: number
  provider: TimingSpan['provider']
  cached: boolean
}

/** Spans in start order, placed on one axis from the request start to the last span's end. */
export function layoutWaterfall(spans: TimingSpan[], totalMs?: number | null): { rows: WaterfallRow[]; totalMs: number } {
  const sorted = [...spans].sort((a, b) => a.offset_ms - b.offset_ms)
  const end = Math.max(totalMs ?? 0, ...sorted.map((s) => s.offset_ms + s.ms), 1)
  const rows = sorted.map((s, i) => ({
    key: `${i}-${s.node}-${s.attempt}`,
    label: (NODE_LABELS[s.node] ?? s.node) + (s.attempt > 0 && ['maker', 'judge', 'rule_check', 'decide'].includes(s.node) ? ` · retry ${s.attempt}` : ''),
    node: s.node,
    attempt: s.attempt,
    ms: s.ms,
    offsetMs: s.offset_ms,
    leftPct: (s.offset_ms / end) * 100,
    widthPct: (s.ms / end) * 100,
    provider: s.provider,
    cached: !!s.cached,
  }))
  return { rows, totalMs: end }
}

/** Evenly spaced axis ticks at round numbers: 0, 50, 100 ms ... or 0, 2, 4, 6 s. */
export function axisTicks(totalMs: number, target = 4): number[] {
  const raw = totalMs / target
  const pow = 10 ** Math.floor(Math.log10(raw))
  const step = [1, 2, 5, 10].map((m) => m * pow).find((s) => s >= raw) ?? raw
  const ticks: number[] = []
  for (let t = 0; t <= totalMs + 1e-9; t += step) ticks.push(Math.round(t))
  return ticks
}
