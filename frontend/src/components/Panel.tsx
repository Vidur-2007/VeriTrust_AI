import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

interface PanelProps {
  title?: ReactNode
  actions?: ReactNode
  children: ReactNode
  className?: string
}

/** A 12 px panel on --surface with a --line border. Depth comes from surfaces, never shadows. */
export function Panel({ title, actions, children, className }: PanelProps) {
  return (
    <section className={cn('rounded-xl border border-line bg-surface', className)}>
      {(title || actions) && (
        <header className="flex items-center justify-between gap-4 border-b border-line px-5 py-3">
          {title && <h2 className="text-base font-semibold">{title}</h2>}
          {actions}
        </header>
      )}
      <div className="p-5">{children}</div>
    </section>
  )
}
