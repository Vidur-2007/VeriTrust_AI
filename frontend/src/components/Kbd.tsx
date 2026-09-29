import type { ReactNode } from 'react'

export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="inline-flex h-6 items-center rounded-md border border-line bg-surface px-1.5 font-sans text-sm text-muted-foreground">
      {children}
    </kbd>
  )
}
