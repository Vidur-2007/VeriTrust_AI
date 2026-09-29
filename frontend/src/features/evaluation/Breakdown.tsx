import { categoryLabel } from '@/lib/format'
import type { EvalMetrics, EvalMode, RateByMode } from '@/lib/types'
import { cn } from '@/lib/utils'
import { MODE_LABELS, MODES, TYPE_LABELS, TYPE_ORDER } from './evalView'

const HATCH = 'repeating-linear-gradient(135deg, transparent 0 4px, color-mix(in srgb, var(--surface) 55%, transparent) 4px 7px)'

function rate(r: RateByMode, m: EvalMode) {
  return r[m]?.hallucination_rate_pct ?? null
}

/** Baseline vs guarded wrong-answer rate per category, as paired horizontal bars. */
export function CategoryBars({ metrics }: { metrics: EvalMetrics }) {
  const cats = Object.keys(metrics.per_category).sort((a, b) => (rate(metrics.per_category[b], 'baseline') ?? 0) - (rate(metrics.per_category[a], 'baseline') ?? 0))
  return (
    <div className="space-y-3">
      <ul className="flex gap-5 text-sm" aria-label="Legend">
        <li className="flex items-center gap-2"><i className="inline-block h-3 w-5 rounded-sm bg-muted-foreground/70" style={{ backgroundImage: HATCH }} aria-hidden />Baseline</li>
        <li className="flex items-center gap-2"><i className="inline-block h-3 w-5 rounded-sm bg-beacon" aria-hidden />Guarded</li>
      </ul>
      <dl className="space-y-3">
        {cats.map((cat) => {
          const r = metrics.per_category[cat]
          return (
            <div key={cat} className="grid grid-cols-[9rem_minmax(0,1fr)] items-center gap-3">
              <dt className="text-sm">{cat === 'other' ? 'Out of scope' : categoryLabel(cat)}<span className="block text-muted-foreground">n={r.guarded?.n ?? r.baseline?.n ?? 0}</span></dt>
              <dd className="space-y-1">
                {(['baseline', 'guarded'] as const).map((m) => {
                  const v = rate(r, m)
                  return (
                    <div key={m} className="grid grid-cols-[minmax(0,1fr)_3.5rem] items-center gap-2">
                      <div className="h-3 rounded-sm bg-surface-2">
                        {v !== null && (
                          <div
                            className={cn('h-full rounded-sm', m === 'baseline' ? 'bg-muted-foreground/70' : 'bg-beacon')}
                            style={{ width: `max(${v}%, 2px)`, backgroundImage: m === 'baseline' ? HATCH : undefined }}
                          />
                        )}
                      </div>
                      <span className="text-right text-sm tabular-nums">
                        <span className="sr-only">{MODE_LABELS[m].label}: </span>{v === null ? '–' : `${v.toFixed(0)}%`}
                      </span>
                    </div>
                  )
                })}
              </dd>
            </div>
          )
        })}
      </dl>
    </div>
  )
}

/** Wrong-answer rate per question type × mode. */
export function TypeTable({ metrics }: { metrics: EvalMetrics }) {
  const modes = MODES.filter((m) => metrics.modes[m])
  const types = TYPE_ORDER.filter((t) => metrics.per_type[t])
  return (
    <table className="w-full">
      <thead className="text-sm text-muted-foreground">
        <tr className="border-b border-line">
          <th scope="col" className="py-2 pr-3 text-left font-medium">Question type</th>
          {modes.map((m) => <th key={m} scope="col" className="px-3 py-2 text-right font-medium" title={MODE_LABELS[m].help}>{MODE_LABELS[m].label}</th>)}
        </tr>
      </thead>
      <tbody>
        {types.map((t) => (
          <tr key={t} className="border-b border-line/70 last:border-0">
            <th scope="row" className="py-2 pr-3 text-left font-medium">{TYPE_LABELS[t]}</th>
            {modes.map((m) => {
              const cell = metrics.per_type[t][m]
              const v = cell?.hallucination_rate_pct
              return (
                <td key={m} className={cn('px-3 py-2 text-right tabular-nums', v && v > 0 ? (m === 'baseline' ? 'text-stop' : 'text-caution') : 'text-muted-foreground')}>
                  {v === null || v === undefined ? '–' : `${v.toFixed(0)}%`}
                  <span className="ml-1 text-sm text-muted-foreground">n={cell?.n ?? 0}</span>
                </td>
              )
            })}
          </tr>
        ))}
      </tbody>
    </table>
  )
}
