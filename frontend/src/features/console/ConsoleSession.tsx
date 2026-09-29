import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'

import { useAppState } from '@/app/AppState'
import { emptyTrace, type TraceState } from '@/components/trace/VerificationTrace'
import { streamChat } from '@/lib/chatStream'
import { useReduceMotion } from '@/lib/motion'
import type { ChatResult, Claim, NodeEvent, StreamEvent } from '@/lib/types'
import { createPacer, type Pacer } from './eventPacer'
import { stopActive, traceReducer, withResult } from './traceReducer'

export interface Turn {
  id: string
  question: string
  inject: boolean
  phase: 'streaming' | 'done' | 'error'
  trace: TraceState
  /** Latest draft text while the turn is running (maker end payload). */
  draft?: string
  /** Which draft (0-based retry) `draft` is. */
  draftRetry: number
  /** Latest claims as the Judge and rule layer return them, before the final result. */
  liveClaims: Claim[]
  /** Which draft (0-based retry) `liveClaims` belong to; lower than trace.retries while rewriting. */
  liveClaimsDraft: number
  flags: string[]
  result?: ChatResult
  error?: string
}

interface ConsoleSession {
  turns: Turn[]
  selected: Turn | undefined
  select: (id: string) => void
  busy: boolean
  send: (question: string) => void
  retry: (id: string) => void
}

const Ctx = createContext<ConsoleSession | null>(null)

/** Minimum time between visible trace steps, so cached demo answers still animate. */
const STEP_MS = 180
/** A rejected draft is the moment the demo is about: keep it on screen before the rewrite starts. */
const REJECT_HOLD_MS = 1400

function stepAfter(e: StreamEvent): number {
  const rejected = e.type === 'node' && e.event.node === 'decide' && e.event.phase === 'end' && e.event.payload.action !== 'approve'
  return rejected ? REJECT_HOLD_MS : STEP_MS
}

function isVisible(e: StreamEvent): boolean {
  if (e.type !== 'node') return true
  const { node, phase } = e.event
  return node !== 'guard_input' && !(node === 'decide' && phase === 'start')
}

function applyNode(t: Turn, e: NodeEvent): Turn {
  const next: Turn = { ...t, trace: traceReducer(t.trace, e) }
  const p = e.payload
  if (e.node === 'guard_input' && e.phase === 'end') next.flags = (p.flags as string[]) ?? []
  if (e.node === 'maker' && e.phase === 'end' && typeof p.draft === 'string') {
    next.draft = p.draft
    next.draftRetry = (p.retry as number | undefined) ?? t.trace.retries
  }
  // The rejected draft's claims stay up while the Maker rewrites, until the Judge checks the new one.
  if ((e.node === 'judge' || e.node === 'rule_check') && e.phase === 'end' && Array.isArray(p.claims)) {
    next.liveClaims = p.claims as Claim[]
    next.liveClaimsDraft = (p.retry as number | undefined) ?? t.trace.retries
  }
  return next
}

/**
 * The console conversation lives above the router, so it survives navigating to another page
 * and back (the demo goes Knowledge base -> console). One question streams at a time.
 */
export function ConsoleSessionProvider({ children }: { children: ReactNode }) {
  const { injectEnabled } = useAppState()
  const reduce = useReduceMotion()
  const [turns, setTurns] = useState<Turn[]>([])
  const [selectedId, setSelectedId] = useState<string>()
  const active = useRef<{ controller: AbortController; pacer: Pacer<StreamEvent> } | null>(null)

  useEffect(() => () => {
    active.current?.controller.abort()
    active.current?.pacer.cancel()
  }, [])

  const update = useCallback((id: string, fn: (t: Turn) => Turn) => {
    setTurns((ts) => ts.map((t) => (t.id === id ? fn(t) : t)))
  }, [])

  const start = useCallback((question: string, inject: boolean) => {
    active.current?.controller.abort()
    active.current?.pacer.cancel()

    const id = crypto.randomUUID()
    setTurns((ts) => [
      // A turn still streaming was just aborted: say so instead of leaving it spinning.
      ...ts.map((t) => (t.phase === 'streaming'
        ? { ...t, phase: 'error' as const, error: 'Stopped because a new question was sent.', trace: stopActive(t.trace) }
        : t)),
      { id, question, inject, phase: 'streaming', trace: emptyTrace(), liveClaims: [], liveClaimsDraft: 0, draftRetry: 0, flags: [] },
    ])
    setSelectedId(id)

    const pacer = createPacer<StreamEvent>(reduce ? 0 : stepAfter, (e) => {
      if (e.type === 'node') update(id, (t) => applyNode(t, e.event))
      else if (e.type === 'result') {
        update(id, (t) => ({ ...t, phase: 'done', result: e.result, trace: withResult(t.trace, e.result) }))
      } else if (e.type === 'error') {
        update(id, (t) => ({ ...t, phase: 'error', error: e.message, trace: stopActive(t.trace) }))
      }
    }, isVisible)
    const controller = new AbortController()
    active.current = { controller, pacer }

    streamChat({ question, inject }, { onEvent: pacer.push, signal: controller.signal })
      .catch((err: Error) => {
        if (err.name === 'AbortError') return
        pacer.push({ type: 'error', message: err.message })
      })
  }, [reduce, update])

  const send = useCallback((question: string) => start(question.trim(), injectEnabled), [start, injectEnabled])
  const retry = useCallback((id: string) => {
    const t = turns.find((x) => x.id === id)
    if (t) start(t.question, t.inject)
  }, [turns, start])

  const value = useMemo<ConsoleSession>(() => ({
    turns,
    selected: turns.find((t) => t.id === selectedId) ?? turns[turns.length - 1],
    select: setSelectedId,
    busy: turns.some((t) => t.phase === 'streaming'),
    send,
    retry,
  }), [turns, selectedId, send, retry])

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useConsoleSession(): ConsoleSession {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useConsoleSession must be used inside <ConsoleSessionProvider>')
  return ctx
}
