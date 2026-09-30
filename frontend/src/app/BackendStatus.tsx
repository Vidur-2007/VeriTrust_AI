import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'

import { api } from '@/lib/api'
import type { Alerts, Health, ReviewQueue, Settings } from '@/lib/types'
import { nextDismissed, readDismissed, writeDismissed } from '@/features/settings/form'
import { usePolling, type Polled } from '@/lib/usePolling'

interface BackendStatus {
  health: Polled<Health>
  settings: Polled<Settings>
  alerts: Polled<Alerts>
  review: Polled<ReviewQueue>
  /** The alert banner was dismissed for the current alert episode. */
  bannerDismissed: boolean
  setBannerDismissed: (v: boolean) => void
}

const BackendStatusContext = createContext<BackendStatus | null>(null)

/** One shared poll per endpoint for everything the shell shows (top bar, rail badge, banner). */
export function BackendStatusProvider({ children }: { children: ReactNode }) {
  const health = usePolling(api.health, 10_000)
  const settings = usePolling(api.settings, 30_000)
  const alerts = usePolling(api.alerts, 15_000)
  const review = usePolling(api.review, 15_000)

  // Settings change rarely and mostly from the Settings page: also refresh on window focus.
  const refreshSettings = settings.refresh
  useEffect(() => {
    window.addEventListener('focus', refreshSettings)
    return () => window.removeEventListener('focus', refreshSettings)
  }, [refreshSettings])

  // Dismissing the banner lasts for this alert episode only: once the alert clears, the next
  // one shows again. Reset during render (not in an effect) so it never flashes.
  const [dismissed, setDismissed] = useState(readDismissed)
  const active = !!alerts.data?.active
  if (alerts.data && nextDismissed(active, dismissed) !== dismissed) {
    setDismissed(false)
    writeDismissed(false)
  }
  const setBannerDismissed = useCallback((v: boolean) => {
    setDismissed(v)
    writeDismissed(v)
  }, [])

  return (
    <BackendStatusContext.Provider value={{ health, settings, alerts, review, bannerDismissed: dismissed, setBannerDismissed }}>
      {children}
    </BackendStatusContext.Provider>
  )
}

export function useBackendStatus(): BackendStatus {
  const ctx = useContext(BackendStatusContext)
  if (!ctx) throw new Error('useBackendStatus must be used inside <BackendStatusProvider>')
  return ctx
}
