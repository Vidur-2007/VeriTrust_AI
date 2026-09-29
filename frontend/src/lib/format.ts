const INR = new Intl.NumberFormat('en-IN')

function isNumber(v: string): boolean {
  return /^-?\d+(\.\d+)?$/.test(v.replace(/,/g, ''))
}

function grouped(v: string): string {
  return INR.format(Number(v.replace(/,/g, '')))
}

/** A fact value in words people read: "₹3,000", "₹650 per kg", "7 kg", "24 hours", "15%". */
export function formatValue(value: string, unit: string | null): string {
  if (!unit) return value
  if (!isNumber(value)) return `${value} ${unit}`
  if (unit === 'INR') return `₹${grouped(value)}`
  if (unit.startsWith('INR/')) return `₹${grouped(value)} per ${unit.slice(4)}`
  if (unit === '%') return `${value}%`
  return `${grouped(value)} ${unit}`
}

/** "just now", "4 min ago", "3 h ago", "2 days ago", then the date. */
export function relativeTime(ts: string, now: number = Date.now()): string {
  const s = Math.round((now - new Date(ts).getTime()) / 1000)
  if (s < 45) return 'just now'
  const m = Math.round(s / 60)
  if (m < 60) return `${m} min ago`
  const h = Math.round(m / 60)
  if (h < 24) return `${h} h ago`
  const d = Math.round(h / 24)
  if (d < 7) return d === 1 ? 'yesterday' : `${d} days ago`
  return new Date(ts).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
}

/** Full local timestamp, for title attributes next to relative times. */
export function fullTime(ts: string): string {
  return new Date(ts).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'medium' })
}

export function clockTime(ts: string): string {
  return new Date(ts).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false })
}

/** 78 -> "78 ms", 4250 -> "4.3 s", 61000 -> "1 min 1 s". */
export function formatMs(ms: number | null | undefined): string {
  if (ms === null || ms === undefined) return '–'
  if (ms < 1000) return `${Math.round(ms)} ms`
  if (ms < 60_000) return `${(ms / 1000).toFixed(ms < 10_000 ? 1 : 0)} s`
  const m = Math.floor(ms / 60_000)
  return `${m} min ${Math.round((ms % 60_000) / 1000)} s`
}

export const CATEGORY_LABELS: Record<string, string> = {
  baggage: 'Baggage', fees: 'Fees', refunds: 'Refunds', cancellations: 'Cancellations',
  check_in: 'Check-in', loyalty: 'Loyalty', special_assistance: 'Special assistance', pets: 'Pets',
}

export function categoryLabel(c: string): string {
  return CATEGORY_LABELS[c] ?? c.replace(/_/g, ' ')
}
