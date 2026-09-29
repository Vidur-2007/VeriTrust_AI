import { CircleCheck, OctagonX, RotateCcw, type LucideIcon } from 'lucide-react'

import type { Status } from '@/lib/types'
import { cn } from '@/lib/utils'

const STYLES: Record<Status, { label: string; icon: LucideIcon; className: string }> = {
  approved: { label: 'Approved', icon: CircleCheck, className: 'border-ok/50 bg-ok/10 text-ok' },
  corrected: {
    label: 'Corrected', icon: RotateCcw, className: 'border-caution/50 bg-caution/10 text-caution',
  },
  escalated: {
    label: 'Escalated', icon: OctagonX, className: 'border-stop/50 bg-stop/10 text-stop',
  },
}

/** Final status of an answer. Icon + word + colour, so it never relies on colour alone. */
export function StatusPill({ status, className }: { status: Status; className?: string }) {
  const s = STYLES[status]
  const Icon = s.icon
  return (
    <span
      className={cn(
        'inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-sm font-medium',
        s.className,
        className,
      )}
    >
      <Icon className="size-4" aria-hidden />
      {s.label}
    </span>
  )
}
