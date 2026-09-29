import { CircleCheck, Minus, RotateCcw, TriangleAlert, UserRound, type LucideIcon } from 'lucide-react'

import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import type { EvalRecord } from '@/lib/types'
import { cn } from '@/lib/utils'
import { badClaims, cellFor, errorText, type CellKind } from './evalView'

const KINDS: Record<CellKind, { label: string; icon: LucideIcon; className: string }> = {
  correct: { label: 'Correct', icon: CircleCheck, className: 'text-ok' },
  corrected: { label: 'Corrected', icon: RotateCcw, className: 'text-caution' },
  escalated: { label: 'To a person', icon: UserRound, className: 'text-muted-foreground' },
  hallucinated: { label: 'Wrong', icon: TriangleAlert, className: 'font-semibold text-stop' },
  skipped: { label: 'Skipped', icon: Minus, className: 'text-muted-foreground' },
  missing: { label: 'Not run', icon: Minus, className: 'text-muted-foreground' },
}

function why(r: EvalRecord | undefined, kind: CellKind): string {
  if (!r) return 'This mode was not part of the run.'
  if (kind === 'skipped') return errorText(r.error) || 'No model could answer.'
  if (kind === 'hallucinated') return badClaims(r).join(' · ') || 'A claim the facts do not support.'
  if (kind === 'corrected') return `The first draft was blocked and rewritten ${r.retries} time${r.retries === 1 ? '' : 's'}.`
  if (kind === 'escalated') return 'The customer got the safe hand-off message.'
  return 'Every checked claim matched the verified facts.'
}

/** One question's result in one mode: icon + word + colour, with the reason on hover. */
export function ResultCell({ record, onOpen }: { record?: EvalRecord; onOpen?: (id: number) => void }) {
  const kind = cellFor(record)
  const k = KINDS[kind]
  const Icon = k.icon
  const openable = !!onOpen && !!record?.interaction_id && !record.skipped
  const body = (
    <>
      <Icon className="size-4 shrink-0" aria-hidden />
      <span>{k.label}</span>
    </>
  )
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {openable ? (
          <button
            type="button"
            onClick={() => onOpen!(record!.interaction_id!)}
            className={cn('inline-flex items-center gap-1.5 rounded-sm text-sm underline-offset-4 hover:underline', k.className)}
          >
            {body}
          </button>
        ) : (
          <span tabIndex={0} className={cn('inline-flex items-center gap-1.5 text-sm', k.className)}>{body}</span>
        )}
      </TooltipTrigger>
      <TooltipContent className="max-w-80">{why(record, kind)}</TooltipContent>
    </Tooltip>
  )
}
