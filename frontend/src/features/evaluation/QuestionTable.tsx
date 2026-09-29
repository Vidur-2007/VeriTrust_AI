import { ChevronRight } from 'lucide-react'
import { Fragment, useState } from 'react'

import { SegmentedControl } from '@/components/SegmentedControl'
import { categoryLabel } from '@/lib/format'
import type { EvalMode, EvalRecord } from '@/lib/types'
import { cn } from '@/lib/utils'
import { badClaims, matchesFilter, MODE_LABELS, TYPE_LABELS, type QuestionFilter, type QuestionRow } from './evalView'
import { ResultCell } from './ResultCell'

const FILTERS: { value: QuestionFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'hallucinated', label: 'Wrong' },
  { value: 'blocked', label: 'Blocked' },
  { value: 'skipped', label: 'Skipped' },
]

function Answer({ r }: { r: EvalRecord }) {
  const bad = badClaims(r)
  return (
    <div className="space-y-1">
      <p className="text-sm font-semibold text-muted-foreground">{MODE_LABELS[r.mode].label} answer</p>
      <p>{r.skipped ? '–' : r.answer}</p>
      {bad.length > 0 && <p className="text-sm text-stop">{bad.join(' · ')}</p>}
      {r.injected_detail && <p className="text-sm text-muted-foreground">Injected: {r.injected_detail}</p>}
    </div>
  )
}

/** Every question with its result per mode. Guarded and injected cells open the interaction. */
export function QuestionTable({ rows, modes, onOpen }: { rows: QuestionRow[]; modes: EvalMode[]; onOpen: (id: number) => void }) {
  const [filter, setFilter] = useState<QuestionFilter>('all')
  const [open, setOpen] = useState<string | null>(null)
  const shown = rows.filter((r) => matchesFilter(r, filter))

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          Hover a result for the reason. Guarded and injected results open the full interaction.
        </p>
        <SegmentedControl label="Show questions" value={filter} onChange={setFilter} options={FILTERS} />
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] table-fixed text-left">
          <colgroup>
            <col className="w-10" />
            <col className="w-16" />
            <col />
            <col className="w-36" />
            {modes.map((m) => <col key={m} className="w-32" />)}
          </colgroup>
          <thead className="text-sm text-muted-foreground">
            <tr className="border-b border-line">
              <th scope="col"><span className="sr-only">Details</span></th>
              <th scope="col" className="py-2 pr-3 font-medium">ID</th>
              <th scope="col" className="py-2 pr-3 font-medium">Question</th>
              <th scope="col" className="py-2 pr-3 font-medium">Type</th>
              {modes.map((m) => <th key={m} scope="col" className="py-2 pr-3 font-medium" title={MODE_LABELS[m].help}>{MODE_LABELS[m].label}</th>)}
            </tr>
          </thead>
          <tbody>
            {shown.map((row) => {
              const expanded = open === row.id
              return (
                <Fragment key={row.id}>
                  <tr className={cn('border-b border-line/70 align-top', expanded && 'border-b-0 bg-surface-2/50')}>
                    <td className="py-2">
                      <button
                        type="button"
                        onClick={() => setOpen(expanded ? null : row.id)}
                        aria-expanded={expanded}
                        aria-label={`${expanded ? 'Hide' : 'Show'} answers for ${row.id}`}
                        className="grid size-7 place-items-center rounded-md text-muted-foreground hover:bg-surface-2 hover:text-foreground"
                      >
                        <ChevronRight className={cn('size-4 transition-transform', expanded && 'rotate-90')} aria-hidden />
                      </button>
                    </td>
                    <td className="py-2.5 pr-3 font-medium">{row.id}</td>
                    <td className="py-2.5 pr-3"><span className="line-clamp-2">{row.question}</span></td>
                    <td className="py-2.5 pr-3 text-sm">
                      {TYPE_LABELS[row.type]}
                      <span className="block text-muted-foreground">{row.category === 'other' ? 'no category' : categoryLabel(row.category)}</span>
                    </td>
                    {modes.map((m) => (
                      <td key={m} className="py-2.5 pr-3"><ResultCell record={row.modes[m]} onOpen={m === 'baseline' ? undefined : onOpen} /></td>
                    ))}
                  </tr>
                  {expanded && (
                    <tr className="border-b border-line/70 bg-surface-2/50">
                      <td />
                      <td colSpan={3 + modes.length} className="space-y-3 pr-3 pb-4">
                        {modes.map((m) => row.modes[m] && <Answer key={m} r={row.modes[m]!} />)}
                      </td>
                    </tr>
                  )}
                </Fragment>
              )
            })}
          </tbody>
        </table>
      </div>
      {!shown.length && <p className="text-muted-foreground">No questions match this filter.</p>}
    </div>
  )
}
