import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, useState, type ReactNode } from 'react'
import { toast } from 'sonner'

import { postSSE } from '@/lib/sse'
import { DEMO_SET, IDLE_RUN, runReducer, toRedTeamEvent, type RunState } from './runState'

interface RedTeamSession {
  run: RunState
  selected: Set<string>
  setSelected: (s: Set<string>) => void
  start: (ids: string[]) => void
  stop: () => void
}

const Ctx = createContext<RedTeamSession | null>(null)

/**
 * The red-team run lives above the router: a full run can take 20+ minutes (the backend waits
 * out Gemini rate limits), so it keeps going while you look at other pages. One run at a time.
 */
export function RedTeamSessionProvider({ children }: { children: ReactNode }) {
  const [run, dispatch] = useReducer(runReducer, IDLE_RUN)
  const [selected, setSelected] = useState(() => new Set(DEMO_SET))
  const controller = useRef<AbortController | null>(null)

  useEffect(() => () => controller.current?.abort(), [])

  const start = useCallback((ids: string[]) => {
    if (!ids.length) return
    controller.current?.abort()
    const c = new AbortController()
    controller.current = c
    dispatch({ type: 'begin', ids, at: Date.now() })
    let finished = false
    postSSE('/redteam/run', { attack_ids: ids }, {
      signal: c.signal,
      onMessage: (event, data) => {
        const e = toRedTeamEvent(event, data)
        if (!e) return
        dispatch({ type: 'event', event: e, at: Date.now() })
        if (e.type === 'done') {
          finished = true
          const t = e.scoreboard.totals
          toast.success('Red team run finished', {
            description: `${t.total - t.escaped} of ${t.total} attacks stopped${t.escaped ? `, ${t.escaped} escaped` : ''}.`,
          })
        }
      },
    })
      .then(() => {
        if (!finished && !c.signal.aborted) dispatch({ type: 'fail', message: 'The run ended before every attack finished. Run the rest to continue.' })
      })
      .catch((err: Error) => {
        if (err.name === 'AbortError' || c.signal.aborted) return
        dispatch({ type: 'fail', message: err.message })
      })
  }, [])

  const stop = useCallback(() => {
    controller.current?.abort()
    dispatch({ type: 'stop' })
  }, [])

  const value = useMemo(() => ({ run, selected, setSelected, start, stop }), [run, selected, start, stop])
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useRedTeam(): RedTeamSession {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useRedTeam must be used inside <RedTeamSessionProvider>')
  return ctx
}
