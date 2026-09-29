import type { ReactNode } from 'react'

import { NumberTicker } from '@/components/ui/number-ticker'
import { Skeleton } from '@/components/ui/skeleton'
import type { Metrics } from '@/lib/types'
import { cn } from '@/lib/utils'

interface Kpi {
  label: string
  value: number | null
  decimals?: number
  suffix?: string
  sub: ReactNode
  tone?: 'ok' | 'caution' | 'stop'
}

const TONE = { ok: 'text-ok', caution: 'text-caution', stop: 'text-stop' }

function kpis(m: Metrics, thresholdPct: number | undefined): Kpi[] {
  const p95 = m.latency_ms.p95
  const blocked = m.blocked_rate_pct
  const over = blocked !== null && thresholdPct !== undefined && blocked > thresholdPct
  return [
    { label: 'Answers', value: m.total, sub: `${m.flagged_inputs} flagged input${m.flagged_inputs === 1 ? '' : 's'}` },
    { label: 'Approved first time', value: m.rates_pct.approved, decimals: 1, suffix: '%', sub: `${m.counts.approved} answer${m.counts.approved === 1 ? '' : 's'}` },
    {
      label: 'Blocked', value: blocked, decimals: 1, suffix: '%',
      sub: over ? `Over the ${thresholdPct}% alert threshold` : `${m.counts.corrected} corrected · ${m.counts.escalated} escalated`,
      tone: over ? 'stop' : undefined,
    },
    { label: 'Average trust', value: m.avg_trust, decimals: 1, sub: 'out of 100' },
    {
      label: 'p95 latency', value: p95 === null ? null : p95 >= 1000 ? p95 / 1000 : p95,
      decimals: p95 !== null && p95 >= 1000 ? 1 : 0, suffix: p95 !== null && p95 >= 1000 ? ' s' : ' ms',
      sub: m.latency_ms.p50 === null ? 'no answers' : `median ${m.latency_ms.p50 >= 1000 ? `${(m.latency_ms.p50 / 1000).toFixed(1)} s` : `${m.latency_ms.p50} ms`}`,
    },
    {
      label: 'Injected errors caught', value: m.injected.catch_rate_pct, decimals: 0, suffix: '%',
      sub: m.injected.total ? `${m.injected.caught} of ${m.injected.total}` : 'none injected yet',
      tone: m.injected.total ? (m.injected.caught === m.injected.total ? 'ok' : 'caution') : undefined,
    },
  ]
}

/** DESIGN: one status strip of KPIs separated by vertical rules, not a grid of identical cards. */
export function KpiStrip({ metrics, thresholdPct }: { metrics?: Metrics; thresholdPct?: number }) {
  return (
    <section aria-label="Key numbers" className="grid grid-cols-2 rounded-xl border border-line bg-surface md:grid-cols-3 xl:grid-cols-6">
      {(metrics ? kpis(metrics, thresholdPct) : Array.from({ length: 6 }, () => null)).map((k, i) => (
        <div
          key={k?.label ?? i}
          className={cn(
            'space-y-1 border-line px-5 py-4',
            // Vertical rules between items and horizontal ones between wrapped rows, per breakpoint.
            i % 2 ? 'border-l' : 'border-l-0', i >= 2 ? 'border-t' : 'border-t-0',
            i % 3 ? 'md:border-l' : 'md:border-l-0', i >= 3 ? 'md:border-t' : 'md:border-t-0',
            i > 0 ? 'xl:border-l' : 'xl:border-l-0', 'xl:border-t-0',
          )}
        >
          {k ? (
            <>
              <p className="text-sm text-muted-foreground">{k.label}</p>
              <p className={cn('font-heading text-[2rem] leading-none font-bold tabular-nums', k.tone && TONE[k.tone])}>
                {k.value === null ? <span className="text-muted-foreground">–</span> : (
                  <><NumberTicker value={k.value} decimalPlaces={k.decimals ?? 0} />{k.suffix && <span className="text-2xl">{k.suffix}</span>}</>
                )}
              </p>
              <p className={cn('text-sm', k.tone === 'stop' ? 'text-stop' : 'text-muted-foreground')}>{k.sub}</p>
            </>
          ) : (
            <>
              <Skeleton className="h-4 w-24 bg-surface-2" />
              <Skeleton className="h-8 w-16 bg-surface-2" />
              <Skeleton className="h-4 w-28 bg-surface-2" />
            </>
          )}
        </div>
      ))}
    </section>
  )
}
