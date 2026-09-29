import type { ReactNode } from 'react'

export interface TooltipRow {
  label: string
  value: ReactNode
  swatch?: ReactNode
}

/** Chart tooltip body on --surface-2 (DESIGN: Recharts styled with tokens, never defaults). */
export function ChartTooltipBox({ title, rows }: { title?: ReactNode; rows: TooltipRow[] }) {
  return (
    <div className="min-w-40 rounded-lg border border-line bg-surface-2 px-3 py-2 text-sm shadow-none">
      {title && <p className="mb-1 text-muted-foreground">{title}</p>}
      <ul className="space-y-0.5">
        {rows.map((r) => (
          <li key={r.label} className="flex items-center gap-2">
            {r.swatch}
            <span className="flex-1">{r.label}</span>
            <span className="font-medium tabular-nums">{r.value}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
