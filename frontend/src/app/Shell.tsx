import { useEffect, useRef } from 'react'
import { Outlet, useNavigate } from 'react-router'
import { toast } from 'sonner'

import { AlertBanner } from './AlertBanner'
import { useAppState } from './AppState'
import { useBackendStatus } from './BackendStatus'
import { CommandPalette } from './CommandPalette'
import { Rail } from './Rail'
import { TopBar } from './TopBar'

function isTyping(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null
  return !!el && (['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName) || el.isContentEditable)
}

/** Ctrl/Cmd+K opens the palette; I toggles injection (never while typing). */
function useShortcuts() {
  const { paletteOpen, setPaletteOpen, injectEnabled, setInjectEnabled } = useAppState()
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setPaletteOpen(!paletteOpen)
        return
      }
      const plain = !e.ctrlKey && !e.metaKey && !e.altKey
      if (plain && e.key.toLowerCase() === 'i' && !paletteOpen && !isTyping(e.target)) {
        setInjectEnabled(!injectEnabled)
        toast(injectEnabled ? 'Injection off' : 'Injection on', {
          description: injectEnabled
            ? 'Answers are drafted normally.'
            : "The next answer's first draft gets one false detail.",
        })
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [paletteOpen, setPaletteOpen, injectEnabled, setInjectEnabled])
}

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
        action: { label: 'View', onClick: () => navigate('/dashboard') },
      })
    }
    prev.current = { local, offline, alert }
  }, [local, offline, alert, health.error, alerts.data, navigate])
}

export function Shell() {
  useShortcuts()
  useStatusToasts()
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
        <main id="main" className="min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto max-w-[1600px] p-6">
            <Outlet />
          </div>
        </main>
      </div>
      <CommandPalette />
    </div>
  )
}
