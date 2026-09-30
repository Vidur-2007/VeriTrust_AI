import { CircleCheck, CircleX, FileSearch, Loader, ScanSearch, Square } from 'lucide-react'
import { AnimatePresence } from 'motion/react'
import { useEffect, useMemo, useRef } from 'react'
import { useSearchParams } from 'react-router'

import { EmptyState, ErrorState } from '@/components/States'
import { AnimatedListItem } from '@/components/ui/animated-list'
import { Button } from '@/components/ui/button'
import { ShimmerButton } from '@/components/ui/shimmer-button'
import { Skeleton } from '@/components/ui/skeleton'
import { TextShimmer } from '@/components/ui/text-shimmer'
import { FindingCard } from '@/features/audit/FindingCard'
import { useAuditScan, type ScanState } from '@/features/audit/useAuditScan'
import { api } from '@/lib/api'
import { formatMs, fullTime, relativeTime } from '@/lib/format'
import type { AuditFinding } from '@/lib/types'
import { usePolling } from '@/lib/usePolling'
import { cn } from '@/lib/utils'

/** "special_assistance.md" -> "Special assistance manual" */
function manualName(file: string): string {
  const base = file.replace(/\.md$/, '').replace(/[_-]+/g, ' ')
  return `${base[0]?.toUpperCase() ?? ''}${base.slice(1)} manual`
}

function Progress({ scan }: { scan: ScanState }) {
  const finished = scan.manuals.filter((m) => m.status !== 'scanning').length
  const pct = scan.total ? (finished / scan.total) * 100 : 0
  const waiting = Math.max(0, scan.total - scan.manuals.length)
  return (
    <section aria-label="Scan progress" className="space-y-3 rounded-xl border border-line bg-surface p-5">
      <div className="flex items-center justify-between gap-3">
        <p className="font-medium" role="status">
          {scan.phase === 'running'
            ? scan.total ? `Scanning: ${finished} of ${scan.total} manuals done` : 'Starting the scan…'
            : scan.phase === 'done' ? `Scan finished${scan.result ? ` in ${formatMs(scan.result.ms)}` : ''}`
            : scan.phase === 'stopped' ? 'Scan stopped' : 'Scan failed'}
        </p>
        <span className="text-sm text-muted-foreground">
          {scan.findings.length} stale section{scan.findings.length === 1 ? '' : 's'} {scan.phase === 'running' ? 'so far' : 'found'}
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-surface-2" role="progressbar" aria-valuemin={0} aria-valuemax={scan.total || 1} aria-valuenow={finished} aria-label="Manuals scanned">
        <div className="h-full rounded-full bg-beacon transition-[width] duration-300" style={{ width: `${scan.phase === 'done' ? 100 : pct}%` }} />
      </div>
      <ul className="grid gap-x-6 gap-y-1.5 sm:grid-cols-2">
        {scan.manuals.map((m) => {
          const count = scan.findings.filter((f) => f.manual === m.name).length
          return (
            <li key={m.name} className="flex items-center gap-2">
              {m.status === 'scanning' ? <Loader className="size-4 shrink-0 animate-spin text-beacon" aria-hidden />
                : m.status === 'error' ? <CircleX className="size-4 shrink-0 text-stop" aria-hidden />
                : <CircleCheck className="size-4 shrink-0 text-ok" aria-hidden />}
              <span className="min-w-0 flex-1 truncate">
                {m.status === 'scanning' ? <TextShimmer as="span">{manualName(m.name)}</TextShimmer> : manualName(m.name)}
              </span>
              <span className={cn('text-sm', m.status === 'error' ? 'text-stop' : 'text-muted-foreground')}>
                {m.status === 'scanning' ? 'Scanning' : m.status === 'error' ? m.message : count ? `${count} stale` : 'Up to date'}
              </span>
            </li>
          )
        })}
        {waiting > 0 && (
          <li className="text-muted-foreground">{waiting} more {scan.phase === 'running' ? 'waiting' : 'not scanned'}</li>
        )}
      </ul>
      {scan.phase === 'failed' && scan.error && <p role="alert" className="text-stop">{scan.error}</p>}
    </section>
  )
}

function Findings({ findings }: { findings: AuditFinding[] }) {
  const groups = useMemo(() => {
    const by = new Map<string, AuditFinding[]>()
    for (const f of findings) by.set(f.manual, [...(by.get(f.manual) ?? []), f])
    return [...by.entries()]
  }, [findings])
  return (
    <div className="space-y-6">
      {groups.map(([manual, items]) => (
        <section key={manual} aria-label={manualName(manual)} className="space-y-3">
          <h3 className="flex items-baseline gap-2 text-lg font-semibold">
            {manualName(manual)}
            <span className="text-sm font-normal text-muted-foreground">{items.length} stale section{items.length === 1 ? '' : 's'}</span>
          </h3>
          <ul className="space-y-3">
            <AnimatePresence initial={false}>
              {items.map((f) => (
                <AnimatedListItem key={`${f.fact_id}-${f.span.join('-')}`} as="li">
                  <FindingCard f={f} />
                </AnimatedListItem>
              ))}
            </AnimatePresence>
          </ul>
        </section>
      ))}
    </div>
  )
}

/** Manual audit (FEATURES #11): scan the manuals against the verified facts, list stale sections. */
export function ManualAudit() {
  const latest = usePolling(api.latestAudit, 60_000)
  const { state: scan, start, stop } = useAuditScan(latest.refresh)
  const running = scan.phase === 'running'

  // "Scan manuals" in the command palette opens /audit?scan=1: start once, then tidy the URL.
  const [params, setParams] = useSearchParams()
  const autoStarted = useRef(false)
  useEffect(() => {
    if (params.get('scan') !== '1' || autoStarted.current) return
    autoStarted.current = true
    setParams((p) => { const next = new URLSearchParams(p); next.delete('scan'); return next }, { replace: true })
    if (!running) start()
  }, [params, setParams, running, start])

  // While scanning (and after) show the scan's own findings; otherwise the last stored audit.
  const showScan = scan.phase !== 'idle'
  const findings = showScan && (running || scan.findings.length || scan.phase === 'done') ? scan.findings : latest.data?.findings ?? []
  const last = latest.data
  const model = last?.findings.find((f) => f.model)?.model

  return (
    <div className="space-y-4">
      <section className="flex flex-wrap items-center gap-4 rounded-xl border border-line bg-surface p-5">
        <div className="min-w-0 flex-1 space-y-1">
          <h2 className="text-lg font-semibold">Are the support manuals still true?</h2>
          <p className="text-muted-foreground">
            Each manual is compared with the verified facts, one model call per manual. Sections that contradict a fact are
            listed with the verified value and a corrected paragraph.
          </p>
          {last ? (
            <p className="text-sm text-muted-foreground">
              Last scan <span title={fullTime(last.ts)}>{relativeTime(last.ts)}</span> · {last.findings.length} stale section{last.findings.length === 1 ? '' : 's'}
              {model && ` · ${model}`}
            </p>
          ) : latest.loading ? <Skeleton className="h-4 w-64 bg-surface-2" /> : null}
        </div>
        {running ? (
          <Button variant="outline" onClick={stop} className="h-11"><Square /> Stop</Button>
        ) : (
          <ShimmerButton onClick={start} className="h-11"><ScanSearch /> Scan manuals</ShimmerButton>
        )}
      </section>

      {showScan && <Progress scan={scan} />}

      {latest.error && !last && !showScan ? (
        <ErrorState title="Couldn't load the last audit" description={latest.error.message} onRetry={latest.refresh} />
      ) : !showScan && latest.loading ? (
        <div className="space-y-3" aria-label="Loading findings">
          <Skeleton className="h-48 w-full bg-surface" />
          <Skeleton className="h-48 w-full bg-surface" />
        </div>
      ) : findings.length ? (
        <Findings findings={findings} />
      ) : running ? null : (
        <EmptyState
          icon={FileSearch}
          title={last || scan.phase === 'done' ? 'No stale sections found' : 'No audit yet'}
          description={last || scan.phase === 'done'
            ? 'Every manual agrees with the verified facts.'
            : 'Scan the manuals to find sections that no longer match the verified facts.'}
        />
      )}
    </div>
  )
}
