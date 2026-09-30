import { ChevronRight } from 'lucide-react'
import { useId, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { useDomain } from '@/app/Domain'
import type { Attack } from '@/lib/types'
import { cn } from '@/lib/utils'
import { OutcomePill } from './OutcomePill'
import { EXPECTED_LABELS, groupState, toggleGroup, TYPE_ORDER, typeLabel, type LastOutcome } from './runState'

const LANG = { hi: 'हिन्दी', te: 'తెలుగు', en: null } as const

function AttackRow({ a, checked, onToggle, disabled, last }: {
  a: Attack
  checked: boolean
  onToggle: () => void
  disabled: boolean
  last?: LastOutcome
}) {
  const [open, setOpen] = useState(false)
  const id = useId()
  return (
    <li className="rounded-lg px-2 py-1.5 hover:bg-surface-2/60">
      <div className="flex items-start gap-2.5">
        <Checkbox id={id} checked={checked} onCheckedChange={onToggle} disabled={disabled} className="mt-0.5" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <label htmlFor={id} className={cn('font-medium', !disabled && 'cursor-pointer')}>{a.title}</label>
            {LANG[a.language] && (
              <span lang={a.language} className="rounded-full border border-line bg-surface-2 px-1.5 text-sm text-muted-foreground">{LANG[a.language]}</span>
            )}
            {last && <OutcomePill outcome={last.outcome} small className="ml-auto" />}
          </div>
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            className="mt-0.5 flex items-center gap-1 rounded-sm text-sm text-muted-foreground hover:text-foreground"
          >
            <ChevronRight className={cn('size-3.5 transition-transform', open && 'rotate-90')} aria-hidden />
            {a.id} · {EXPECTED_LABELS[a.expected]}
          </button>
          {open && (
            <div className="mt-1.5 space-y-1 rounded-md border border-line bg-bg p-2.5 text-sm">
              <p lang={a.language}>“{a.prompt}”</p>
              <p className="text-muted-foreground">{a.notes}</p>
            </div>
          )}
        </div>
      </div>
    </li>
  )
}

interface Props {
  attacks: Attack[]
  selected: Set<string>
  onChange: (s: Set<string>) => void
  disabled: boolean
  last: Record<string, LastOutcome>
}

/** The attack library grouped by type, with a tri-state checkbox per group. */
export function AttackLibrary({ attacks, selected, onChange, disabled, last }: Props) {
  const demo = useDomain().domain.demo_attacks
  const groups = TYPE_ORDER.map((t) => ({ type: t, items: attacks.filter((a) => a.type === t) })).filter((g) => g.items.length)
  const toggle = (id: string) => {
    const next = new Set(selected)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    onChange(next)
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="mr-auto text-sm text-muted-foreground" aria-live="polite">{selected.size} of {attacks.length} selected</span>
        <Button variant="outline" size="sm" disabled={disabled} onClick={() => onChange(new Set(demo))}>Demo set ({demo.length})</Button>
        <Button variant="outline" size="sm" disabled={disabled} onClick={() => onChange(new Set(attacks.map((a) => a.id)))}>All</Button>
        <Button variant="outline" size="sm" disabled={disabled} onClick={() => onChange(new Set())}>None</Button>
      </div>
      {groups.map((g) => {
        const ids = g.items.map((a) => a.id)
        const state = groupState(ids, selected)
        const gid = `group-${g.type}`
        return (
          <section key={g.type} aria-labelledby={gid} className="rounded-lg border border-line bg-bg/40">
            <div className="flex items-center gap-2.5 border-b border-line px-3 py-2">
              <Checkbox
                checked={state}
                onCheckedChange={() => onChange(toggleGroup(ids, selected))}
                disabled={disabled}
                aria-labelledby={gid}
              />
              <h3 id={gid} className="flex-1 font-semibold">{typeLabel(g.type)}</h3>
              <span className="text-sm text-muted-foreground">{ids.filter((id) => selected.has(id)).length}/{ids.length}</span>
            </div>
            <ul className="space-y-0.5 p-1.5">
              {g.items.map((a) => (
                <AttackRow key={a.id} a={a} checked={selected.has(a.id)} onToggle={() => toggle(a.id)} disabled={disabled} last={last[a.id]} />
              ))}
            </ul>
          </section>
        )
      })}
    </div>
  )
}
