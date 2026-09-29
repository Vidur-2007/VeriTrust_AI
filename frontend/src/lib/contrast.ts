// WCAG 2.x contrast ratio between two colours ("#rrggbb" or "rgb(r, g, b)").

function channels(colour: string): [number, number, number] | null {
  const c = colour.trim()
  const hex = c.match(/^#([0-9a-f]{6})$/i)
  if (hex) {
    const n = parseInt(hex[1], 16)
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
  }
  const rgb = c.match(/^rgba?\((\d+)[ ,]+(\d+)[ ,]+(\d+)/i)
  return rgb ? [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])] : null
}

function luminance([r, g, b]: [number, number, number]): number {
  const lin = (v: number) => {
    const s = v / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
}

export function contrastRatio(fg: string, bg: string): number | null {
  const a = channels(fg)
  const b = channels(bg)
  if (!a || !b) return null
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

/** Read a CSS custom property from <html>, e.g. cssVar('--accent') -> "#6ea8fe". */
export function cssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim()
}
