import { Link } from 'react-router'

import { NumberTicker } from '@/components/ui/number-ticker'
import type { Metrics } from '@/lib/types'
import { cn } from '@/lib/utils'

/** How many injected errors the guardrail caught, and which layer caught the bad claims. */
export function CatchRate({ metrics }: { metrics: Metrics }) {
  const inj = metrics.injected
  const { judge, rules } = metrics.caught_by
  const caughtClaims = judge + rules
  const judgePct = caughtClaims ? (judge / caughtClaims) * 100 : 0

  return (
    <div className="space-y-5">
      {inj.total ? (
        <div>
          <p className={cn('font-heading text-5xl leading-none font-bold tabular-nums', inj.caught === inj.total ? 'text-ok' : 'text-caution')}>
            <NumberTicker value={inj.catch_rate_pct ?? 0} />%
          </p>
          <p className="mt-1 text-muted-foreground">
            {inj.caught} of {inj.total} injected errors were caught before the customer saw them.
          </p>
        </div>
      ) : (
        <p className="text-muted-foreground">
          No errors injected in this period. Press <kbd className="rounded border border-line px-1">I</kbd> in the{' '}
          <Link to="/" className="text-beacon underline-offset-4 hover:underline">Live console</Link> and ask a question.
        </p>
      )}

      <div className="space-y-2">
        <p className="text-sm text-muted-foreground">
          Blocked claims by layer ({caughtClaims} in total)
        </p>
        <div className="flex h-3 overflow-hidden rounded-full bg-surface-2" aria-hidden>
          <div className="bg-beacon" style={{ width: `${judgePct}%` }} />
          <div className="bg-muted-foreground/60" style={{ width: `${caughtClaims ? 100 - judgePct : 0}%` }} />
        </div>
        <dl className="flex gap-6 text-sm">
          <div className="flex items-center gap-2">
            <i className="inline-block size-2.5 rounded-full bg-beacon" aria-hidden />
            <dt>Judge</dt><dd className="font-semibold tabular-nums">{judge}</dd>
          </div>
          <div className="flex items-center gap-2">
            <i className="inline-block size-2.5 rounded-full bg-muted-foreground/60" aria-hidden />
            <dt>Rule layer</dt><dd className="font-semibold tabular-nums">{rules}</dd>
          </div>
        </dl>
      </div>
    </div>
  )
}
