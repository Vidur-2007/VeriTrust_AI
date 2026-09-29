import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'

export interface Polled<T> {
  data: T | undefined
  error: Error | undefined
  loading: boolean
  refresh: () => void
}

/**
 * Fetch now and every `intervalMs`, pausing while the tab is hidden and refetching when it
 * becomes visible again. Keeps the last good data when a poll fails.
 */
export function usePolling<T>(fetcher: () => Promise<T>, intervalMs: number): Polled<T> {
  const [data, setData] = useState<T>()
  const [error, setError] = useState<Error>()
  const [loading, setLoading] = useState(true)
  const fetcherRef = useRef(fetcher)
  useLayoutEffect(() => {
    fetcherRef.current = fetcher
  })

  // Only the newest request may set state: when the fetcher changes (a new filter), a slow
  // answer to the old one must not overwrite the new one.
  const seq = useRef(0)
  const refresh = useCallback(() => {
    const mine = ++seq.current
    fetcherRef
      .current()
      .then((d) => {
        if (mine !== seq.current) return
        setData(d)
        setError(undefined)
      })
      .catch((e: unknown) => mine === seq.current && setError(e instanceof Error ? e : new Error(String(e))))
      .finally(() => mine === seq.current && setLoading(false))
  }, [])

  useEffect(() => {
    refresh()
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') refresh()
    }, intervalMs)
    const onVisible = () => document.visibilityState === 'visible' && refresh()
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [intervalMs, refresh])

  return { data, error, loading, refresh }
}
