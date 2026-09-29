import { useCallback, useEffect, useRef, useState } from 'react'

import { postSSE } from '@/lib/sse'
import type { AuditEvent, AuditFinding } from '@/lib/types'

export function toAuditEvent(event: string, data: string): AuditEvent | null {
  const body = JSON.parse(data)
  switch (event) {
    case 'progress':
      return { type: 'progress', manual: body.manual, done: body.done, total: body.total }
    case 'finding':
      return { type: 'finding', finding: body }
    case 'error':
      return { type: 'error', manual: body.manual ?? '', message: body.message ?? 'The scan stopped.' }
    case 'result':
      return { type: 'result', ...body }
    default:
      return null
  }
}

export type ManualStatus = 'scanning' | 'done' | 'error'

export interface ScanState {
  phase: 'idle' | 'running' | 'done' | 'stopped' | 'failed'
  total: number
  manuals: { name: string; status: ManualStatus; message?: string }[]
  findings: AuditFinding[]
  error?: string
  result?: Extract<AuditEvent, { type: 'result' }>
}

const IDLE: ScanState = { phase: 'idle', total: 0, manuals: [], findings: [] }

/** Apply one audit event. Progress for manual N means manual N-1 has finished. */
export function scanReducer(s: ScanState, e: AuditEvent): ScanState {
  const settle = (ms: ScanState['manuals']) => ms.map((m) => (m.status === 'scanning' ? { ...m, status: 'done' as const } : m))
  switch (e.type) {
    case 'progress':
      return { ...s, total: e.total, manuals: [...settle(s.manuals), { name: e.manual, status: 'scanning' }] }
    case 'finding':
      return { ...s, findings: [...s.findings, e.finding] }
    case 'error': {
      const known = s.manuals.some((m) => m.name === e.manual)
      const manuals = known
        ? s.manuals.map((m) => (m.name === e.manual ? { ...m, status: 'error' as const, message: e.message } : m))
        : [...s.manuals, { name: e.manual, status: 'error' as const, message: e.message }]
      return { ...s, manuals }
    }
    case 'result':
      return { ...s, phase: 'done', manuals: settle(s.manuals), findings: e.findings, result: e }
  }
}

/** Runs POST /api/audit/manuals and keeps the live progress. */
export function useAuditScan(onDone: () => void) {
  const [state, setState] = useState<ScanState>(IDLE)
  const controller = useRef<AbortController | null>(null)
  const onDoneRef = useRef(onDone)
  useEffect(() => {
    onDoneRef.current = onDone
  })
  useEffect(() => () => controller.current?.abort(), [])

  const start = useCallback(() => {
    controller.current?.abort()
    const c = new AbortController()
    controller.current = c
    setState({ ...IDLE, phase: 'running' })
    postSSE('/audit/manuals', undefined, {
      signal: c.signal,
      onMessage: (event, data) => {
        const e = toAuditEvent(event, data)
        if (e) setState((s) => scanReducer(s, e))
      },
    })
      .then(() => {
        setState((s) => (s.phase === 'running' ? { ...s, phase: 'failed', error: 'The scan ended before it finished. Try again.' } : s))
        onDoneRef.current()
      })
      .catch((err: Error) => {
        if (err.name === 'AbortError') return
        setState((s) => ({ ...s, phase: 'failed', error: err.message }))
      })
  }, [])

  const stop = useCallback(() => {
    controller.current?.abort()
    setState((s) => ({ ...s, phase: 'stopped', manuals: s.manuals.map((m) => (m.status === 'scanning' ? { ...m, status: 'error', message: 'Stopped' } : m)) }))
  }, [])

  return { state, start, stop }
}
