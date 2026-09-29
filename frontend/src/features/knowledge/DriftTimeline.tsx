import { History } from 'lucide-react'
import { AnimatePresence } from 'motion/react'

import { ErrorState } from '@/components/States'
import { AnimatedListItem } from '@/components/ui/animated-list'
import { Skeleton } from '@/components/ui/skeleton'
import { formatValue, fullTime, relativeTime } from '@/lib/format'
import type { DriftEvent } from '@/lib/types'
import { cn } from '@/lib/utils'

interface Props {
  events?: DriftEvent[]
  error?: Error
  onRetry: () => void
  onPick: (factId: string) => void
  activeFact: string | null
}

/** Every change to a verified fact, newest first (FEATURES #10). */
export function DriftTimeline({ events, error, onRetry, onPick, activeFact }: Props) {
  if (error && !events) return <ErrorState title="Couldn't load the drift timeline" description={error.message} onRetry={onRetry} />
  if (!events) {
    return (
      <div className="space-y-3" aria-label="Loading drift timeline">
        {Array.from({ length: 3 }, (_, i) => <Skeleton key={i} className="h-16 w-full bg-surface-2" />)}
      </div>
    )
  }
  if (!events.length) {
    return (
      <div className="flex flex-col items-start gap-2 text-muted-foreground">
        <History className="size-5" aria-hidden />
        <p>No changes yet. Edit a fact to see drift here.</p>
      </div>
    )
  }
  return (
    <ol className="relative space-y-3 before:absolute before:top-2 before:bottom-2 before:left-[5px] before:w-px before:bg-line" aria-label="Fact changes, newest first">
      <AnimatePresence initial={false}>
        {events.map((e) => (
          <AnimatedListItem key={e.id} as="li" className="relative pl-6">
            <span className={cn('absolute top-2 left-0 size-[11px] rounded-full border-2 border-surface', e.source === 'review' ? 'bg-beacon' : 'bg-caution')} aria-hidden />
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <button
                type="button"
                onClick={() => onPick(e.fact_id)}
                aria-pressed={activeFact === e.fact_id}
                className={cn('rounded-sm font-medium hover:text-beacon', activeFact === e.fact_id && 'text-beacon')}
                aria-label={`Show ${e.fact_id} in the table`}
              >
                {e.fact_id}
              </button>
              <span className="rounded-full border border-line bg-surface-2 px-2 text-sm text-muted-foreground">
                {e.source === 'review' ? 'Review queue' : e.old_value === null ? 'New fact' : 'Edit'}
              </span>
              <span className="ml-auto text-sm text-muted-foreground" title={fullTime(e.ts)}>{relativeTime(e.ts)}</span>
            </div>
            {e.subject && <p className="text-sm text-muted-foreground">{e.subject} · {e.attribute}</p>}
            <p className="mt-0.5">
              {e.old_value !== null && (
                <><del className="text-stop decoration-2"><span className="sr-only">from </span>{formatValue(e.old_value, e.unit)}</del>{' → '}</>
              )}
              <ins className="font-semibold text-ok underline-offset-4"><span className="sr-only">to </span>{formatValue(e.new_value, e.unit)}</ins>
            </p>
          </AnimatedListItem>
        ))}
      </AnimatePresence>
    </ol>
  )
}
