import { TriangleAlert, type LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface EmptyStateProps {
  icon: LucideIcon
  title: string
  description?: ReactNode
  action?: ReactNode
  className?: string
}

/** Empty states invite an action: "No escalations yet. Try the Red Team Lab to generate some." */
export function EmptyState({ icon: Icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div className={cn('flex flex-col items-start gap-3 rounded-xl border border-dashed border-line p-8', className)}>
      <Icon className="size-6 text-muted-foreground" aria-hidden />
      <div>
        <h2 className="text-lg font-semibold">{title}</h2>
        {description && <p className="mt-1 max-w-prose text-muted-foreground">{description}</p>}
      </div>
      {action}
    </div>
  )
}

interface ErrorStateProps {
  title: string
  /** What happened and what to do next. */
  description?: ReactNode
  onRetry?: () => void
  className?: string
}

export function ErrorState({ title, description, onRetry, className }: ErrorStateProps) {
  return (
    <div role="alert" className={cn('flex flex-col items-start gap-3 rounded-xl border border-stop/50 bg-stop/5 p-6', className)}>
      <p className="flex items-center gap-2 font-semibold text-stop">
        <TriangleAlert className="size-5" aria-hidden />
        {title}
      </p>
      {description && <p className="max-w-prose text-muted-foreground">{description}</p>}
      {onRetry && (
        <Button variant="outline" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  )
}
