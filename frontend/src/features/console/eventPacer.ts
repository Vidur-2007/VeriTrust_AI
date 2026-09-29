/**
 * Releases queued items in order. After a visible item is released, the next visible item waits
 * at least `stepMs` (a number, or per item, so a key moment can be held on screen longer).
 *
 * Cached demo answers stream every event in ~50 ms; without pacing the trace would finish
 * before anyone sees it. Live answers are slower than the step time, so they play in real
 * time. With reduced motion the step is 0 and everything is released at once.
 */
export interface Pacer<T> {
  push: (item: T) => void
  cancel: () => void
}

export function createPacer<T>(
  stepMs: number | ((item: T) => number),
  release: (item: T) => void,
  isVisible: (item: T) => boolean = () => true,
): Pacer<T> {
  const gapAfter = typeof stepMs === 'function' ? stepMs : () => stepMs
  const queue: T[] = []
  let timer: ReturnType<typeof setTimeout> | null = null
  let readyAt = -Infinity
  let cancelled = false

  const pump = () => {
    if (cancelled || timer !== null) return
    while (queue.length) {
      const next = queue[0]
      const visible = isVisible(next)
      const wait = visible ? readyAt - Date.now() : 0
      if (wait > 0) {
        timer = setTimeout(() => {
          timer = null
          pump()
        }, wait)
        return
      }
      queue.shift()
      if (visible) readyAt = Date.now() + gapAfter(next)
      release(next)
    }
  }

  return {
    push(item) {
      if (cancelled) return
      queue.push(item)
      pump()
    },
    cancel() {
      cancelled = true
      queue.length = 0
      if (timer !== null) clearTimeout(timer)
    },
  }
}
