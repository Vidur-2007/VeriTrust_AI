import type { Claim } from '@/lib/types'

export type Segment =
  | { kind: 'text'; text: string }
  | { kind: 'claim'; text: string; claim: Claim; index: number }

/**
 * Split answer text into plain text and claim segments using the server-computed spans.
 * Claims without a usable span, or overlapping an earlier claim, are returned as `unplaced`
 * (they still appear in the verdict panel's claim list).
 */
export function segmentText(text: string, claims: Claim[]): { segments: Segment[]; unplaced: Claim[] } {
  const placed: { claim: Claim; index: number; start: number; end: number }[] = []
  const unplaced: Claim[] = []
  claims.forEach((claim, index) => {
    const { span_start: start, span_end: end } = claim
    if (start == null || end == null || start < 0 || end > text.length || start >= end) {
      unplaced.push(claim)
    } else {
      placed.push({ claim, index, start, end })
    }
  })
  placed.sort((a, b) => a.start - b.start || b.end - a.end)

  const segments: Segment[] = []
  let cursor = 0
  for (const p of placed) {
    if (p.start < cursor) {
      unplaced.push(p.claim)
      continue
    }
    if (p.start > cursor) segments.push({ kind: 'text', text: text.slice(cursor, p.start) })
    segments.push({ kind: 'claim', text: text.slice(p.start, p.end), claim: p.claim, index: p.index })
    cursor = p.end
  }
  if (cursor < text.length) segments.push({ kind: 'text', text: text.slice(cursor) })
  return { segments, unplaced }
}
