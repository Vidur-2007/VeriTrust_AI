import { ArrowRight } from 'lucide-react'
import { motion } from 'motion/react'

import { NumberTicker } from '@/components/ui/number-ticker'
import type { EvalMetrics } from '@/lib/types'
import { cn } from '@/lib/utils'

const HATCH = 'repeating-linear-gradient(135deg, transparent 0 5px, color-mix(in srgb, var(--surface) 55%, transparent) 5px 9px)'

function Bar({ label, pct, hatched, className }: { label: string; pct: number; hatched?: boolean; className: string }) {
  return (
    <div className="grid grid-cols-[6.5rem_minmax(0,1fr)_4rem] items-center gap-3">
      <span className="text-sm">{label}</span>
      <div className="h-6 rounded-sm bg-surface-2" aria-hidden>
        <motion.div
          initial={{ scaleX: 0 }}
          animate={{ scaleX: 1 }}
          transition={{ duration: 0.4, ease: 'easeOut' }}
          className={cn('h-full origin-left rounded-sm', className)}
          style={{ width: `max(${pct}%, 2px)`, backgroundImage: hatched ? HATCH : undefined }}
        />
      </div>
      <span className="text-right font-semibold tabular-nums">{pct.toFixed(1)}%</span>
    </div>
  )
}

/** The headline: how often customers get a wrong answer, without and with the guardrail. */
export function Hero({ metrics }: { metrics: EvalMetrics }) {
  const c = metrics.comparison
  const b = c.baseline_hallucination_rate_pct
  const g = c.guarded_hallucination_rate_pct
  if (b === undefined || b === null || g === undefined || g === null) {
    return (
      <p className="text-muted-foreground">
        The before and after comparison needs both baseline and guarded results for the same questions. Run the eval with
        <code className="mx-1 rounded bg-surface-2 px-1.5">--mode all</code>.
      </p>
    )
  }
  return (
    <div className="grid items-center gap-6 lg:grid-cols-[auto_minmax(0,1fr)]">
      <div className="flex items-end gap-5">
        <div>
          <p className="text-sm text-muted-foreground">Without the guardrail</p>
          <p className={cn('font-heading text-6xl leading-none font-bold tabular-nums', b > 0 ? 'text-stop' : 'text-ok')}>
            <NumberTicker value={b} decimalPlaces={1} />%
          </p>
        </div>
        <ArrowRight className="mb-2 size-7 text-muted-foreground" aria-hidden />
        <div>
          <p className="text-sm text-muted-foreground">With the guardrail</p>
          <p className={cn('font-heading text-6xl leading-none font-bold tabular-nums', g > 0 ? 'text-caution' : 'text-ok')}>
            <NumberTicker value={g} decimalPlaces={1} />%
          </p>
        </div>
      </div>
      <div className="space-y-2">
        <Bar label="Baseline" pct={b} hatched className="bg-muted-foreground/70" />
        <Bar label="Guarded" pct={g} className="bg-beacon" />
        <p className="text-sm text-muted-foreground">
          Wrong answers reaching the customer
          {c.reduction_pts !== null && c.reduction_pts !== undefined && (
            <>: <span className="font-semibold text-foreground">
              {c.reduction_pts === 0 ? 'no change' : `${c.reduction_pts > 0 ? '−' : '+'}${Math.abs(c.reduction_pts).toFixed(1)} points`}
            </span></>
          )}
          {' '}on {c.paired_n} question{c.paired_n === 1 ? '' : 's'} answered in both modes. Wrong means a contradicted
          claim, or an unsupported one in a high-risk category.
        </p>
      </div>
    </div>
  )
}
