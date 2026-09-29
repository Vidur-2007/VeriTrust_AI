import { Hourglass } from 'lucide-react'
import { useEffect, useState } from 'react'

import { useBackendStatus } from '@/app/BackendStatus'
import { TextShimmer } from '@/components/ui/text-shimmer'
import { formatMs } from '@/lib/format'
import type { RunState } from './runState'

function useNow(active: boolean): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!active) return
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [active])
  return now
}

/** Progress of the running batch: bar, current attack, elapsed time, and why it's waiting. */
export function RunProgress({ run }: { run: RunState }) {
  const { health } = useBackendStatus()
  const running = run.phase === 'running'
  const now = useNow(running)
  const done = run.results.length
  const pct = run.total ? (done / run.total) * 100 : 0
  const elapsed = run.startedAt ? (run.ms ?? now - run.startedAt) : 0
  const current = run.current
  const currentFor = current ? now - current.startedAt : 0
  const p = health.data?.provider
  const waiting = running && currentFor > 20_000 && p && (p.rate_limited_recently || p.gemini_retry_in_s > 0)

  const title = running
    ? `Running: ${done} of ${run.total} attacks done`
    : run.phase === 'done' ? `Finished all ${run.total} attacks`
    : run.phase === 'stopped' ? `Stopped after ${done} of ${run.total}`
    : `Run failed after ${done} of ${run.total}`

  return (
    <section aria-label="Run progress" className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-medium" role="status">{title}</p>
        <span className="text-sm text-muted-foreground tabular-nums">{formatMs(Math.round(elapsed / 1000) * 1000)}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-surface-2" role="progressbar" aria-label="Attacks run" aria-valuemin={0} aria-valuemax={run.total} aria-valuenow={done}>
        <div className="h-full rounded-full bg-beacon transition-[width] duration-300" style={{ width: `${pct}%` }} />
      </div>
      {current && (
        <p className="flex flex-wrap items-center gap-x-2 text-sm">
          <span className="text-muted-foreground">Now:</span>
          <TextShimmer as="span" className="font-medium">{`${current.id} · ${current.title}`}</TextShimmer>
          <span className="text-muted-foreground tabular-nums">{Math.round(currentFor / 1000)} s</span>
        </p>
      )}
      {waiting && (
        <p className="flex items-center gap-2 text-sm text-caution">
          <Hourglass className="size-4" aria-hidden />
          Waiting for Gemini (rate limit or overload){p!.gemini_retry_in_s > 0 ? `, retrying in ${p!.gemini_retry_in_s} s` : ''}. Red team runs wait instead of using the local model.
        </p>
      )}
    </section>
  )
}
