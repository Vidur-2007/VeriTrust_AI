import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'

export type Theme = 'dark' | 'light'

const THEME_KEY = 'veritrust-theme'

interface AppState {
  theme: Theme
  toggleTheme: () => void
  /** When on, the next console question asks the Maker to include one false detail. */
  injectEnabled: boolean
  setInjectEnabled: (on: boolean) => void
  paletteOpen: boolean
  setPaletteOpen: (open: boolean) => void
}

const AppStateContext = createContext<AppState | null>(null)

function readTheme(): Theme {
  try {
    return localStorage.getItem(THEME_KEY) === 'light' ? 'light' : 'dark'
  } catch {
    return 'dark' // storage blocked (private window): the default still works
  }
}

export function AppStateProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>(readTheme)
  const [injectEnabled, setInjectEnabled] = useState(false)
  const [paletteOpen, setPaletteOpen] = useState(false)

  useEffect(() => {
    try {
      localStorage.setItem(THEME_KEY, theme)
    } catch {
      // per-viewer convenience only
    }
  }, [theme])

  const toggleTheme = useCallback(() => {
    const next: Theme = document.documentElement.dataset.theme === 'light' ? 'dark' : 'light'
    document.documentElement.dataset.theme = next // before the re-render, so token reads are current
    setTheme(next)
  }, [])

  const value = useMemo(
    () => ({ theme, toggleTheme, injectEnabled, setInjectEnabled, paletteOpen, setPaletteOpen }),
    [theme, toggleTheme, injectEnabled, paletteOpen],
  )
  return <AppStateContext.Provider value={value}>{children}</AppStateContext.Provider>
}

export function useAppState(): AppState {
  const ctx = useContext(AppStateContext)
  if (!ctx) throw new Error('useAppState must be used inside <AppStateProvider>')
  return ctx
}
