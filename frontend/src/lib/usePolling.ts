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

  const refresh = useCallback(() => {
    fetcherRef
      .current()
      .then((d) => {
        setData(d)
        setError(undefined)
      })
      .catch((e: unknown) => setError(e instanceof Error ? e : new Error(String(e))))
      .finally(() => setLoading(false))
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
