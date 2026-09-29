import { MotionConfig } from 'motion/react'
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'

export type Theme = 'dark' | 'light'

const THEME_KEY = 'veritrust-theme'
const MOTION_KEY = 'veritrust-reduce-motion'

interface AppState {
  theme: Theme
  toggleTheme: () => void
  /** When on, the next console question asks the Maker to include one false detail. */
  injectEnabled: boolean
  setInjectEnabled: (on: boolean) => void
  paletteOpen: boolean
  setPaletteOpen: (open: boolean) => void
  /** Viewer override: reduce motion even if the OS setting doesn't ask for it. */
  reduceMotion: boolean
  setReduceMotion: (on: boolean) => void
}

const AppStateContext = createContext<AppState | null>(null)

function read(key: string, fallback: string): string {
  try {
    return localStorage.getItem(key) ?? fallback
  } catch {
    return fallback // storage blocked (private window): the default still works
  }
}

function write(key: string, value: string): void {
  try {
    localStorage.setItem(key, value)
  } catch {
    // per-viewer convenience only
  }
}

export function AppStateProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>(() => (read(THEME_KEY, 'dark') === 'light' ? 'light' : 'dark'))
  const [injectEnabled, setInjectEnabled] = useState(false)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [reduceMotion, setReduceMotion] = useState(() => read(MOTION_KEY, '0') === '1')

  useEffect(() => write(THEME_KEY, theme), [theme])

  useEffect(() => {
    // CSS keyframe effects (marquee, meteors, shimmer) key off this attribute; motion
    // components read MotionConfig below. The OS setting is honoured by both as well.
    document.documentElement.dataset.motion = reduceMotion ? 'reduce' : 'auto'
    write(MOTION_KEY, reduceMotion ? '1' : '0')
  }, [reduceMotion])

  const toggleTheme = useCallback(() => {
    const next: Theme = document.documentElement.dataset.theme === 'light' ? 'dark' : 'light'
    document.documentElement.dataset.theme = next // before the re-render, so token reads are current
    setTheme(next)
  }, [])

  const value = useMemo(
    () => ({
      theme, toggleTheme, injectEnabled, setInjectEnabled, paletteOpen, setPaletteOpen,
      reduceMotion, setReduceMotion,
    }),
    [theme, toggleTheme, injectEnabled, paletteOpen, reduceMotion],
  )
  return (
    <AppStateContext.Provider value={value}>
      {/* "user" follows prefers-reduced-motion; "always" is the viewer's override. */}
      <MotionConfig reducedMotion={reduceMotion ? 'always' : 'user'}>{children}</MotionConfig>
    </AppStateContext.Provider>
  )
}

export function useAppState(): AppState {
  const ctx = useContext(AppStateContext)
  if (!ctx) throw new Error('useAppState must be used inside <AppStateProvider>')
  return ctx
}
