import type { InteractionPage, Status, TimeseriesPoint } from '@/lib/types'

export type RangeKey = 'hour' | 'day'

export const RANGES: Record<RangeKey, { label: string; windowMin: number; seriesMin: number; bucketMin: number }> = {
  hour: { label: 'Last hour', windowMin: 60, seriesMin: 60, bucketMin: 1 },
  day: { label: 'Last 24 h', windowMin: 1440, seriesMin: 1440, bucketMin: 30 },
}

export interface Bucket {
  /** ISO time of the bucket start. */
  start: string
  label: string
  total: number
  approved: number
  corrected: number
  escalated: number
}

function label(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false })
}

/** Sum per-minute points into `bucketMin`-minute buckets (oldest first, like the input). */
export function bucketSeries(points: TimeseriesPoint[], bucketMin: number): Bucket[] {
  const out: Bucket[] = []
  for (let i = 0; i < points.length; i += bucketMin) {
    const group = points.slice(i, i + bucketMin)
    const start = group[0].minute.length === 17 ? group[0].minute.replace('Z', ':00Z') : group[0].minute
    out.push({
      start,
      label: label(start),
      total: group.reduce((n, p) => n + p.total, 0),
      approved: group.reduce((n, p) => n + p.approved, 0),
      corrected: group.reduce((n, p) => n + p.corrected, 0),
      escalated: group.reduce((n, p) => n + p.escalated, 0),
    })
  }
  return out
}

/** Filters in the recent table. "blocked" isn't an API status: it merges corrected + escalated. */
export type TableFilter = 'all' | 'blocked' | Status

export function mergePages(pages: InteractionPage[], limit: number): InteractionPage {
  const items = pages.flatMap((p) => p.items).sort((a, b) => b.id - a.id).slice(0, limit)
  return { total: pages.reduce((n, p) => n + p.total, 0), limit, offset: 0, items }
}
