import { motion } from 'motion/react'

import { formatMs } from '@/lib/format'
import type { TimingSpan } from '@/lib/types'
import { cn } from '@/lib/utils'
import { axisTicks, layoutWaterfall } from './waterfallLayout'

const CACHED_STRIPES = 'repeating-linear-gradient(135deg, transparent 0 4px, color-mix(in srgb, var(--bg) 55%, transparent) 4px 7px)'

/**
 * Latency waterfall (FEATURES #18): one bar per step on a shared time axis, so a retry shows up
 * as a second Maker/Judge pair. Model calls are blue; cached calls are striped and say so.
 */
export function Waterfall({ spans, totalMs, className }: { spans: TimingSpan[]; totalMs?: number | null; className?: string }) {
  if (!spans.length) return <p className="text-muted-foreground">No timings were recorded for this answer.</p>
  const { rows, totalMs: end } = layoutWaterfall(spans, totalMs)
  const ticks = axisTicks(end)

  return (
    <figure className={cn('space-y-2', className)}>
      <figcaption className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
        <span>Total {formatMs(end)}</span>
        <span className="flex items-center gap-1.5"><i className="inline-block h-2.5 w-4 rounded-sm bg-beacon" aria-hidden />Model call</span>
        <span className="flex items-center gap-1.5"><i className="inline-block h-2.5 w-4 rounded-sm bg-beacon" style={{ backgroundImage: CACHED_STRIPES }} aria-hidden />Cached call</span>
        <span className="flex items-center gap-1.5"><i className="inline-block h-2.5 w-4 rounded-sm bg-muted-foreground/60" aria-hidden />Local step</span>
      </figcaption>

      <div aria-hidden className="space-y-1.5">
        {rows.map((r, i) => {
          const llm = r.provider !== null
          return (
            <div key={r.key} className="grid grid-cols-[8.5rem_minmax(0,1fr)_4.5rem] items-center gap-2 text-sm">
              <span className={cn('truncate', r.attempt > 0 && 'text-caution')}>{r.label}</span>
              <div className="relative h-4 rounded-sm bg-surface-2">
                <motion.div
                  initial={{ scaleX: 0 }}
                  animate={{ scaleX: 1 }}
                  transition={{ duration: 0.25, delay: Math.min(i * 0.03, 0.3), ease: 'easeOut' }}
                  className={cn('absolute inset-y-0 origin-left rounded-sm', llm ? 'bg-beacon' : 'bg-muted-foreground/60')}
                  style={{
                    left: `${r.leftPct}%`,
                    width: `max(${r.widthPct}%, 2px)`,
                    backgroundImage: r.cached ? CACHED_STRIPES : undefined,
                  }}
                />
              </div>
              <span className="text-right tabular-nums text-muted-foreground">
                {formatMs(r.ms)}
                {r.provider === 'ollama' && !r.cached && <span className="block text-sm leading-tight">Gemma</span>}
              </span>
            </div>
          )
        })}
        <div className="grid grid-cols-[8.5rem_minmax(0,1fr)_4.5rem] gap-2 text-sm text-muted-foreground">
          <span />
          <div className="relative h-5 border-t border-line">
            {ticks.map((t) => (
              <span
                key={t}
                className="absolute top-0.5 -translate-x-1/2 tabular-nums first:translate-x-0"
                style={{ left: `${(t / end) * 100}%` }}
              >
                {formatMs(t)}
              </span>
            ))}
          </div>
          <span />
        </div>
      </div>

      {/* The same data for screen readers. */}
      <table className="sr-only">
        <caption>Time spent in each step, total {formatMs(end)}</caption>
        <thead><tr><th>Step</th><th>Started at</th><th>Took</th><th>Source</th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key}>
              <td>{r.label}</td>
              <td>{formatMs(r.offsetMs)}</td>
              <td>{formatMs(r.ms)}</td>
              <td>{r.provider === null ? 'local step' : r.cached ? 'cached model call' : r.provider === 'ollama' ? 'local model (Gemma)' : 'Gemini'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  )
}
