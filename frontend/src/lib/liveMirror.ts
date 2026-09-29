import type { StreamEvent } from '@/lib/types'

/**
 * The customer site forwards its chat stream to any open console tab in the same browser, so
 * one question shows up in both views (demo steps 1 and 2). Tabs talk through BroadcastChannel;
 * where it isn't available the mirror is simply off.
 */
export const LIVE_CHANNEL = 'veritrust-live'

/** Identifies this tab, so a tab never mirrors its own messages back to itself. */
const TAB_ID = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : String(Math.random())

export interface MirrorMessage {
  source: 'site'
  tab?: string
  /** One id per customer question; every event of that question carries it. */
  id: string
  question: string
  event: StreamEvent
}

function open(): BroadcastChannel | null {
  return typeof BroadcastChannel === 'function' ? new BroadcastChannel(LIVE_CHANNEL) : null
}

/** Sender for the site. `post` is a no-op without BroadcastChannel. */
export function mirrorSender(): { post: (m: MirrorMessage) => void; close: () => void } {
  const ch = open()
  return {
    post: (m) => {
      try {
        ch?.postMessage({ ...m, tab: TAB_ID })
      } catch {
        // a closed channel or an uncloneable event: the mirror is best effort
      }
    },
    close: () => ch?.close(),
  }
}

/** Listener for the console. Returns the unsubscribe function. */
export function subscribeMirror(onMessage: (m: MirrorMessage) => void): () => void {
  const ch = open()
  if (!ch) return () => {}
  ch.onmessage = (e: MessageEvent<MirrorMessage>) => {
    const m = e.data
    if (m?.source === 'site' && m.tab !== TAB_ID && m.id && m.event) onMessage(m)
  }
  return () => ch.close()
}
