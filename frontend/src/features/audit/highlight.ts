const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

export interface Part {
  text: string
  match: boolean
}

function numberForms(value: string): { n: number | null; forms: string[] } {
  const plain = value.replace(/,/g, '').trim()
  const n = /^\d+(\.\d+)?$/.test(plain) ? Number(plain) : null
  return { n, forms: n !== null && Number.isInteger(n) ? [...new Set([n.toLocaleString('en-US'), String(n)])] : [value.trim()] }
}

function split(text: string, pattern: RegExp, isMatch: (m: string) => boolean = () => true): Part[] {
  const out: Part[] = []
  let last = 0
  for (const m of text.matchAll(pattern)) {
    if (m.index > last) out.push({ text: text.slice(last, m.index), match: false })
    out.push({ text: m[0], match: isMatch(m[0]) })
    last = m.index + m[0].length
  }
  if (last < text.length) out.push({ text: text.slice(last), match: false })
  return out
}

/** Split text around every occurrence of a value ("₹650", "3,000" or "3000"), for highlighting. */
export function highlightValue(text: string, value: string): Part[] {
  const { n, forms } = numberForms(value)
  if (!forms[0]) return [{ text, match: false }]
  const pattern = n !== null
    ? new RegExp(`₹?(?<![\\d.,])(?:${forms.map(escape).join('|')})(?![\\d]|[.,]\\d)`, 'g')
    : new RegExp(`(?:${forms.map(escape).join('|')})`, 'gi')
  return split(text, pattern)
}

const NUMBER = /₹?\d[\d,]*(?:\.\d+)?/g
const toNum = (m: string) => Number(m.replace(/[₹,]/g, ''))

/** The stale value in the manual's quote: of the numbers that differ from the verified value, the
 *  one closest to it in size ("₹550 per kg for 2 bags" vs 650 -> ₹550), so other numbers stay plain. */
export function staleNumbers(quote: string, verified: string): Part[] {
  const { n } = numberForms(verified)
  if (n === null || n === 0) return [{ text: quote, match: false }]
  const candidates = [...quote.matchAll(NUMBER)].map((m) => toNum(m[0])).filter((x) => x > 0 && x !== n)
  if (!candidates.length) return [{ text: quote, match: false }]
  const best = candidates.reduce((a, b) => (Math.abs(Math.log(b / n)) < Math.abs(Math.log(a / n)) ? b : a))
  let marked = false
  return split(quote, NUMBER, (m) => {
    if (marked || toNum(m) !== best) return false
    marked = true
    return true
  })
}

/** The model writes lists inline ("counter: - Domestic: ₹650. - International: …"). Put each
 *  bullet back on its own line, as it is in the manual. */
export function restoreBullets(paragraph: string): string {
  return paragraph.replace(/\s+-\s+(?=\S)/g, '\n- ')
}
