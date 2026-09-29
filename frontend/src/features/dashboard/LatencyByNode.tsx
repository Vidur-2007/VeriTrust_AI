import { motion } from 'motion/react'

import { formatMs } from '@/lib/format'
import type { Metrics } from '@/lib/types'

const NODES = [
  { key: 'retrieve_manual', label: 'Retrieve' },
  { key: 'maker', label: 'Maker' },
  { key: 'judge', label: 'Judge' },
  { key: 'rule_check', label: 'Rules' },
] as const

/** Average time per step, and where the total lands (avg, median, p95). */
export function LatencyByNode({ metrics }: { metrics: Metrics }) {
  const values = NODES.map((n) => ({ ...n, ms: metrics.node_avg_ms[n.key] ?? null }))
  const max = Math.max(1, ...values.map((v) => v.ms ?? 0))
  const l = metrics.latency_ms

  return (
    <div className="grid gap-6 sm:grid-cols-[minmax(0,1fr)_auto]">
      <dl className="space-y-3">
        {values.map((v, i) => (
          <div key={v.key} className="grid grid-cols-[5rem_minmax(0,1fr)_4.5rem] items-center gap-3">
            <dt>{v.label}</dt>
            <dd className="h-5 rounded-sm bg-surface-2" aria-hidden>
              {v.ms !== null && (
                <motion.div
                  initial={{ scaleX: 0 }}
                  animate={{ scaleX: 1 }}
                  transition={{ duration: 0.3, delay: i * 0.04, ease: 'easeOut' }}
                  className="h-full origin-left rounded-sm bg-beacon"
                  style={{ width: `max(${(v.ms / max) * 100}%, 2px)` }}
                />
              )}
            </dd>
            <dd className="text-right tabular-nums">{v.ms === null ? '–' : formatMs(v.ms)}</dd>
          </div>
        ))}
      </dl>
      <dl className="grid grid-cols-3 gap-4 border-line sm:grid-cols-1 sm:border-l sm:pl-6">
        {([['Average', l.avg], ['Median', l.p50], ['p95', l.p95]] as const).map(([label, ms]) => (
          <div key={label}>
            <dt className="text-sm text-muted-foreground">{label} total</dt>
            <dd className="font-heading text-2xl font-bold tabular-nums">{formatMs(ms)}</dd>
          </div>
        ))}
      </dl>
    </div>
  )
}
