import { StatStrip, type Stat } from '@/components/StatStrip'
import type { Metrics } from '@/lib/types'

function kpis(m: Metrics, thresholdPct: number | undefined): Stat[] {
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

/** Dashboard key numbers, in the shared status strip. */
export function KpiStrip({ metrics, thresholdPct }: { metrics?: Metrics; thresholdPct?: number }) {
  return <StatStrip label="Key numbers" items={metrics ? kpis(metrics, thresholdPct) : undefined} />
}
