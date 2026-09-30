import { describe, expect, it } from 'vitest'

import { PAGES } from './routes'
import { createSequence, GO_KEYS, goKeyFor, parseInteractionQuery, SHORTCUTS } from './keys'

describe('parseInteractionQuery', () => {
  it('reads an interaction id from the palette search', () => {
    expect(parseInteractionQuery('#895')).toBe(895)
    expect(parseInteractionQuery('895')).toBe(895)
    expect(parseInteractionQuery(' #12 ')).toBe(12)
    for (const q of ['abc', '#', '12a', '0', '#0', '', 'dashboard']) expect(parseInteractionQuery(q)).toBeNull()
  })
})

describe('createSequence', () => {
  it('fires on G then a mapped letter, once', () => {
    const s = createSequence(GO_KEYS, 1500)
    expect(s.feed({ key: 'g' }, 0)).toBe('pending')
    expect(s.feed({ key: 'd' }, 400)).toBe('/dashboard')
    expect(s.feed({ key: 'd' }, 500)).toBeNull()
  })

  it('expires, resets on an unknown key, and ignores modifiers', () => {
    const s = createSequence(GO_KEYS, 1500)
    s.feed({ key: 'g' }, 0)
    expect(s.feed({ key: 'd' }, 2000)).toBeNull() // too late
    s.feed({ key: 'G' }, 3000)
    expect(s.feed({ key: 'x' }, 3100)).toBeNull()
    expect(s.feed({ key: 'r' }, 3200)).toBeNull() // not armed any more
    s.feed({ key: 'g' }, 4000)
    expect(s.feed({ key: 'd', ctrlKey: true }, 4100)).toBeNull()
    expect(s.armed).toBe(false)
  })
})

describe('shortcut table', () => {
  it('only maps to pages that exist, and every page-with-shortcut shows it', () => {
    const paths = new Set(PAGES.map((p) => p.path))
    for (const path of Object.values(GO_KEYS)) expect(paths.has(path)).toBe(true)
    expect(goKeyFor('/dashboard')).toBe('G D')
    expect(goKeyFor('/styleguide')).toBeUndefined()
    expect(SHORTCUTS.some((s) => s.keys === '?')).toBe(true)
  })
})
