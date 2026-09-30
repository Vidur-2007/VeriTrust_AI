import { Search } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router'

import { useBackendStatus } from '@/app/BackendStatus'
import { Panel } from '@/components/Panel'
import { SegmentedControl } from '@/components/SegmentedControl'
import { ErrorState } from '@/components/States'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { CatchRate } from '@/features/dashboard/CatchRate'
import { ExportMenu } from '@/features/dashboard/ExportMenu'
import { InteractionDrawer } from '@/features/dashboard/InteractionDrawer'
import { KpiStrip } from '@/features/dashboard/KpiStrip'
import { LatencyByNode } from '@/features/dashboard/LatencyByNode'
import { OutcomeChart } from '@/features/dashboard/OutcomeChart'
import { RecentTable } from '@/features/dashboard/RecentTable'
import { bucketSeries, mergePages, RANGES, type RangeKey, type TableFilter } from '@/features/dashboard/series'
import { api } from '@/lib/api'
import { usePolling } from '@/lib/usePolling'

const PAGE = 20
const FILTERS: { value: TableFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'blocked', label: 'Blocked' },
  { value: 'escalated', label: 'Escalated' },
]

function useParam<T extends string>(name: string, fallback: T, allowed: readonly T[]): [T, (v: T) => void] {
  const [params, setParams] = useSearchParams()
  const raw = params.get(name) as T | null
  const value = raw && allowed.includes(raw) ? raw : fallback
  const set = useCallback((v: T) => setParams((p) => {
    const next = new URLSearchParams(p)
    if (v === fallback) next.delete(name)
    else next.set(name, v)
    return next
  }, { replace: true }), [name, fallback, setParams])
  return [value, set]
}

/** Dashboard (FEATURES #2, #18): KPI strip, outcome and latency charts, recent interactions. */
export function Dashboard() {
  const { settings } = useBackendStatus()
  const [params, setParams] = useSearchParams()
  const [range, setRange] = useParam<RangeKey>('range', 'hour', ['hour', 'day'])
  const [filter, setFilter] = useParam<TableFilter>('filter', 'all', ['all', 'blocked', 'escalated', 'approved', 'corrected'])
  const openId = Number(params.get('id')) || null
  const [search, setSearch] = useState('')
  const [q, setQ] = useState(search)
  // "Show more" grows the page; a new filter or search starts again at one page.
  const [more, setMore] = useState({ key: '', n: PAGE })

  useEffect(() => {
    const t = setTimeout(() => setQ(search.trim()), 300)
    return () => clearTimeout(t)
  }, [search])

  const limit = more.key === `${filter}|${q}` ? more.n : PAGE
  const r = RANGES[range]
  const fetchMetrics = useCallback(() => api.metrics(r.windowMin, r.seriesMin), [r.windowMin, r.seriesMin])
  const metrics = usePolling(fetchMetrics, 10_000)

  const fetchPage = useCallback(() => {
    if (filter === 'blocked') {
      return Promise.all([
        api.interactions({ status: 'corrected', q, limit }),
        api.interactions({ status: 'escalated', q, limit }),
      ]).then((pages) => mergePages(pages, limit))
    }
    return api.interactions({ status: filter === 'all' ? null : filter, q, limit })
  }, [filter, q, limit])
  const page = usePolling(fetchPage, 10_000)

  // Refetch when the range, filter, search or page size changes (the first load is the poll's own).
  const first = useRef(true)
  const refreshMetrics = metrics.refresh
  const refreshPage = page.refresh
  useEffect(() => {
    if (first.current) return
    refreshMetrics()
  }, [fetchMetrics, refreshMetrics])
  useEffect(() => {
    if (first.current) { first.current = false; return }
    refreshPage()
  }, [fetchPage, refreshPage])

  // Right after a range switch the data is still the old range's: show loading, not a mix.
  const m = metrics.data?.window_min === r.windowMin ? metrics.data : undefined
  const buckets = useMemo(() => (m ? bucketSeries(m.timeseries, r.bucketMin) : []), [m, r.bucketMin])

  const open = (id: number | null) => setParams((p) => {
    const next = new URLSearchParams(p)
    if (id === null) next.delete('id')
    else next.set('id', String(id))
    return next
  }, { replace: true })

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-muted-foreground">
          Answers from the console, customer site and red team. Evaluation runs are left out. Updates every 10 s.
        </p>
        <SegmentedControl
          label="Period"
          value={range}
          onChange={setRange}
          options={(Object.keys(RANGES) as RangeKey[]).map((k) => ({ value: k, label: RANGES[k].label }))}
        />
      </div>

      {metrics.error && !m ? (
        <ErrorState title="Couldn't load the metrics" description={metrics.error.message} onRetry={metrics.refresh} />
      ) : (
        <>
          <KpiStrip metrics={m} thresholdPct={settings.data?.alert_threshold_pct} />

          <Panel title="Approved vs blocked answers">
            {m ? <OutcomeChart buckets={buckets} bucketMin={r.bucketMin} /> : <Skeleton className="h-64 w-full bg-surface-2" />}
          </Panel>

          <div className="grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
            <Panel title="Average time per step">
              {m ? <LatencyByNode metrics={m} /> : <Skeleton className="h-36 w-full bg-surface-2" />}
            </Panel>
            <Panel title="Catch rate">
              {m ? <CatchRate metrics={m} /> : <Skeleton className="h-36 w-full bg-surface-2" />}
            </Panel>
          </div>
        </>
      )}

      <Panel
        title="Recent interactions"
        actions={
          <div className="flex flex-wrap items-center justify-end gap-2">
            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
              <Input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search questions"
                aria-label="Search questions"
                className="h-10 w-56 pl-8"
              />
            </div>
            <SegmentedControl label="Show" value={filter} onChange={setFilter} options={FILTERS} />
            <ExportMenu />
          </div>
        }
      >
        <RecentTable
          page={page.data}
          error={page.error}
          loading={page.loading}
          selectedId={openId}
          onOpen={open}
          onMore={() => setMore({ key: `${filter}|${q}`, n: limit + PAGE })}
          onRetry={page.refresh}
          filtered={filter !== 'all' || !!q}
        />
      </Panel>

      <InteractionDrawer id={openId} onClose={() => open(null)} />
    </div>
  )
}
