import { MOD_KEY } from '@/lib/platform'

/** `G` then a letter goes to a page. One table drives the handler, the palette and the rail. */
export const GO_KEYS: Record<string, string> = {
  c: '/',
  d: '/dashboard',
  r: '/review',
  k: '/knowledge',
  a: '/audit',
  t: '/redteam',
  e: '/eval',
  s: '/settings',
}

/** "G D" for a path, or undefined when the page has no shortcut. */
export function goKeyFor(path: string): string | undefined {
  const entry = Object.entries(GO_KEYS).find(([, p]) => p === path)
  return entry ? `G ${entry[0].toUpperCase()}` : undefined
}

/** Everything the keyboard does, for the list in the palette (FEATURES #22). */
export const SHORTCUTS: { keys: string; label: string }[] = [
  { keys: `${MOD_KEY} K`, label: 'Open the command palette' },
  { keys: '?', label: 'Show these keyboard shortcuts' },
  { keys: 'I', label: 'Turn error injection on or off' },
  { keys: 'G then a letter', label: 'Go to a page (the letter is shown next to each page)' },
  { keys: 'Enter', label: 'Send a question in the console (Shift+Enter for a new line)' },
  { keys: 'Esc', label: 'Close a dialog, drawer or popover' },
]

/** Parse "#895", "895" or " #12 " into an interaction id; anything else is null. */
export function parseInteractionQuery(q: string): number | null {
  const m = q.trim().match(/^#?(\d{1,7})$/)
  const n = m ? Number(m[1]) : 0
  return n > 0 ? n : null
}

export interface KeyInput {
  key: string
  ctrlKey?: boolean
  metaKey?: boolean
  altKey?: boolean
}

/**
 * Two-key sequences ("g" then "d"). `feed` returns the target when a sequence completes, and
 * `'pending'` while it waits for the second key. The first key expires after `timeoutMs`.
 */
export function createSequence(map: Record<string, string>, timeoutMs = 1500, leader = 'g') {
  let armedAt: number | null = null
  return {
    feed(e: KeyInput, now: number = Date.now()): string | 'pending' | null {
      if (e.ctrlKey || e.metaKey || e.altKey) {
        armedAt = null
        return null
      }
      const key = e.key.toLowerCase()
      if (armedAt !== null && now - armedAt <= timeoutMs) {
        armedAt = null
        return map[key] ?? null
      }
      armedAt = key === leader ? now : null
      return armedAt === null ? null : 'pending'
    },
    reset() {
      armedAt = null
    },
    get armed() {
      return armedAt !== null
    },
  }
}

/** Keys never act while the viewer is typing. */
export function isTyping(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null
  return !!el && (['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName) || el.isContentEditable)
}
