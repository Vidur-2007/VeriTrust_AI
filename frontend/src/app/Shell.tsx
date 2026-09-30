import { motion } from 'motion/react'
import { useEffect, useRef } from 'react'
import { useLocation, useNavigate, useOutlet } from 'react-router'
import { toast } from 'sonner'

import { DotPattern } from '@/components/ui/dot-pattern'
import { FAST } from '@/lib/motion'
import { cn } from '@/lib/utils'
import { AlertBanner } from './AlertBanner'
import { useBackendStatus } from './BackendStatus'
import { CommandPalette } from './CommandPalette'
import { Rail } from './Rail'
import { TopBar } from './TopBar'
import { useShortcuts } from './useShortcuts'

/** Toast once when the backend switches to the local model, goes offline, or an alert fires. */
function useStatusToasts() {
  const { health, alerts } = useBackendStatus()
  const navigate = useNavigate()
  const prev = useRef({ local: false, offline: false, alert: false })

  const local = !!health.data?.provider.running_locally && !health.error
  const offline = !!health.error
  const alert = !!alerts.data?.active

  useEffect(() => {
    const p = prev.current
    if (local && !p.local) toast.warning('Gemini unavailable. Running locally on Gemma.')
    if (!local && p.local && !offline) toast.success('Gemini is back.')
    if (offline && !p.offline) toast.error("Can't reach the backend.", { description: health.error?.message })
    if (alert && !p.alert) {
      toast.error(alerts.data?.message ?? 'Too many answers are being blocked.', {
        action: { label: 'View', onClick: () => navigate('/dashboard?filter=blocked') },
      })
    }
    prev.current = { local, offline, alert }
  }, [local, offline, alert, health.error, alerts.data, navigate])
}

/** Each page fades in when you navigate (DESIGN.md: quick cross-fade, <= 200 ms). The new page
 *  appears at once and fades over the old position, so nothing waits on an exit animation. */
function PageTransition({ className }: { className?: string }) {
  const { pathname } = useLocation()
  const outlet = useOutlet()
  return (
    <motion.div
      key={pathname}
      className={className}
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={FAST}
    >
      {outlet}
    </motion.div>
  )
}

export function Shell() {
  const goPending = useShortcuts()
  useStatusToasts()
  const { pathname } = useLocation()
  // The one ambient background in the ops app: faint dots behind the live console only.
  const consoleBackground = pathname === '/'
  return (
    <div className="flex h-dvh overflow-hidden">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:top-3 focus:left-3 focus:z-50 focus:rounded-lg focus:bg-surface-2 focus:px-3 focus:py-2"
      >
        Skip to content
      </a>
      <Rail />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar />
        <AlertBanner />
        <main id="main" className="relative min-h-0 flex-1 overflow-y-auto">
          {consoleBackground && (
            <DotPattern
              width={22}
              height={22}
              cr={1.1}
              className="opacity-60 [mask-image:radial-gradient(ellipse_70%_60%_at_60%_35%,black,transparent)]"
            />
          )}
          {/* The console fills the space left under the top bar and any banner; other pages scroll. */}
          <div className={cn('relative mx-auto max-w-[1600px] p-6', consoleBackground && 'lg:h-full')}>
            <PageTransition className={consoleBackground ? 'lg:h-full' : undefined} />
          </div>
        </main>
      </div>
      <CommandPalette />
      {goPending && (
        <div role="status" className="pointer-events-none fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-lg border border-line bg-surface-2 px-3 py-2 text-sm shadow-lg">
          <kbd className="font-semibold">G</kbd> then: C console · D dashboard · R review · K knowledge · A audit · T red team · E eval · S settings
        </div>
      )}
    </div>
  )
}
