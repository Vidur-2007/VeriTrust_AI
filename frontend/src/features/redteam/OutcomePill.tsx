import type { RedTeamOutcome } from '@/lib/types'
import { cn } from '@/lib/utils'
import { OUTCOMES } from './runState'

/** Outcome of one attack: icon + word + colour, never colour alone. */
export function OutcomePill({ outcome, className, small }: { outcome: RedTeamOutcome; className?: string; small?: boolean }) {
  const o = OUTCOMES[outcome]
  const Icon = o.icon
  return (
    <span
      title={o.help}
      className={cn(
        'inline-flex shrink-0 items-center gap-1 rounded-full border font-medium',
        small ? 'h-6 px-2 text-sm' : 'h-7 gap-1.5 px-2.5 text-sm',
        o.className,
        className,
      )}
    >
      <Icon className={small ? 'size-3.5' : 'size-4'} aria-hidden />
      {o.label}
    </span>
  )
}
