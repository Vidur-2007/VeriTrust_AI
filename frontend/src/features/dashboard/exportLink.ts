import type { Channel, Status } from '@/lib/types'

export type ExportRange = 'hour' | 'day' | 'all'
export type ExportFormat = 'csv' | 'json'

export interface ExportChoice {
  range: ExportRange
  channel: Channel | 'all'
  status: Status | 'all'
}

const RANGE_MIN: Record<Exclude<ExportRange, 'all'>, number> = { hour: 60, day: 1440 }

/** Same timestamp format the backend stores (UTC, milliseconds, Z), so `since` compares as text. */
export function isoMinutesAgo(minutes: number, now: number = Date.now()): string {
  return new Date(now - minutes * 60_000).toISOString()
}

/** GET /api/export/interactions.{csv,json} with the chosen filters. */
export function exportLink(format: ExportFormat, c: ExportChoice, now: number = Date.now()): string {
  const q = new URLSearchParams()
  if (c.channel !== 'all') q.set('channel', c.channel)
  if (c.status !== 'all') q.set('status', c.status)
  if (c.range !== 'all') q.set('since', isoMinutesAgo(RANGE_MIN[c.range], now))
  const s = q.toString()
  return `/api/export/interactions.${format}${s ? `?${s}` : ''}`
}

/** A file name that says what is inside, e.g. interactions-console-escalated-24h.csv */
export function exportFileName(format: ExportFormat, c: ExportChoice): string {
  const parts = ['interactions']
  if (c.channel !== 'all') parts.push(c.channel)
  if (c.status !== 'all') parts.push(c.status)
  if (c.range !== 'all') parts.push(c.range === 'hour' ? '1h' : '24h')
  return `${parts.join('-')}.${format}`
}
