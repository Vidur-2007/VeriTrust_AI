import type { ReactNode } from 'react'

import { NumberTicker } from '@/components/ui/number-ticker'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

export interface Stat {
  label: string
  value: number | null
  decimals?: number
  /** Written before the number, e.g. "+". */
  prefix?: string
  suffix?: string
  sub: ReactNode
  tone?: 'ok' | 'caution' | 'stop'
}

const TONE = { ok: 'text-ok', caution: 'text-caution', stop: 'text-stop' }

/** DESIGN: one status strip of numbers separated by vertical rules, not identical cards.
 *  `items` undefined shows skeletons (`count` of them). */
export function StatStrip({ items, count = 6, label }: { items?: Stat[]; count?: number; label: string }) {
  const n = items?.length ?? count
  const cols = n >= 6 ? 'xl:grid-cols-6' : n === 5 ? 'xl:grid-cols-5' : 'xl:grid-cols-4'
  return (
    <section aria-label={label} className={cn('grid grid-cols-2 rounded-xl border border-line bg-surface md:grid-cols-3', cols)}>
      {(items ?? Array.from({ length: count }, () => null)).map((k, i) => (
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
                  <>
                    {k.prefix}
                    <NumberTicker value={k.value} decimalPlaces={k.decimals ?? 0} />
                    {k.suffix && <span className="text-2xl">{k.suffix}</span>}
                  </>
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
