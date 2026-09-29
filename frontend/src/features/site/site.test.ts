/// <reference types="node" />
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

import { contrastRatio } from '@/lib/contrast'

/** The .site-theme tokens, read from index.css so the test checks what ships. */
function siteTokens(): Record<string, string> {
  const css = readFileSync(new URL('../../index.css', import.meta.url), 'utf-8')
  const block = css.slice(css.indexOf('.site-theme {'), css.indexOf('}', css.indexOf('.site-theme {')))
  return Object.fromEntries([...block.matchAll(/--([\w-]+):\s*(#[0-9a-f]{6})/gi)].map((m) => [m[1], m[2]]))
}

describe('customer site palette (WCAG AA)', () => {
  const t = siteTokens()
  const pairs: [string, string, number][] = [
    ['text', 'bg', 4.5], ['text', 'surface', 4.5], ['text', 'surface-2', 4.5],
    ['text-muted', 'bg', 4.5], ['text-muted', 'surface', 4.5], ['text-muted', 'surface-2', 4.5],
    ['accent', 'bg', 4.5], ['accent', 'surface', 4.5], ['accent', 'surface-2', 4.5],
    ['on-accent', 'accent', 4.5],
    ['on-gold', 'brand-gold', 4.5], ['on-gold', 'brand-gold-soft', 4.5],
    ['surface', 'brand-ink', 4.5], ['brand-gold', 'brand-ink', 4.5], ['brand-gold-soft', 'brand-ink', 4.5],
    ['ok', 'surface', 4.5], ['caution', 'surface', 4.5], ['stop', 'surface', 4.5],
    // Borders and the focus ring against the page: non-text contrast (3:1) for the ring.
    ['accent', 'surface', 3],
  ]
  it.each(pairs)('%s on %s is at least %s:1', (fg, bg, min) => {
    expect(t[fg], fg).toBeDefined()
    expect(t[bg], bg).toBeDefined()
    expect(contrastRatio(t[fg], t[bg])!).toBeGreaterThanOrEqual(min)
  })
})
