// Client copy of backend/app/facts_service.py substitute_value(), so the edit dialog can show the
// new statement before saving. The dialog sends the statement it shows, so the two never disagree.

function toNumber(text: string): number | null {
  const t = text.replace(/,/g, '').trim()
  return /^-?\d+(\.\d+)?$/.test(t) ? Number(t) : null
}

function formats(n: number): string[] {
  if (Number.isInteger(n)) return [...new Set([n.toLocaleString('en-US'), String(n)])]
  return [String(n)]
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** Replace the old value in a statement with the new one, keeping its number format
 *  ("₹3,000" -> "₹3,500"). Returns null if the old value isn't in the statement. */
export function previewStatement(statement: string, oldValue: string, newValue: string): string | null {
  const oldN = toNumber(oldValue)
  const newN = toNumber(newValue)
  if (oldN === null || newN === null) {
    const pattern = new RegExp(`(?<!\\w)${escape(oldValue)}(?!\\w)`)
    return pattern.test(statement) ? statement.replace(pattern, newValue) : null
  }
  for (const fmt of formats(oldN)) {
    const pattern = new RegExp(`(?<![\\d.,])${escape(fmt)}(?![\\d]|[.,]\\d)`)
    if (pattern.test(statement)) {
      const replacement = fmt.includes(',') && Number.isInteger(newN) ? newN.toLocaleString('en-US') : newValue.trim()
      return statement.replace(pattern, replacement)
    }
  }
  return null
}
