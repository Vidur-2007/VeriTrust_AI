import { History, Pencil } from 'lucide-react'
import { motion } from 'motion/react'

import { Button } from '@/components/ui/button'
import { categoryLabel, formatValue, fullTime, relativeTime } from '@/lib/format'
import { useReduceMotion } from '@/lib/motion'
import type { Fact } from '@/lib/types'
import { useTokenValues } from '@/lib/useTokens'
import { cn } from '@/lib/utils'

interface Props {
  facts: Fact[]
  onEdit: (fact: Fact) => void
  /** "<fact id>:<save time>" for the fact just saved: its row remounts and flashes once. */
  flashKey: string | null
}

function Row({ f, onEdit, flash }: { f: Fact; onEdit: (f: Fact) => void; flash: boolean }) {
  const reduce = useReduceMotion()
  const { '--accent': accent } = useTokenValues(['--accent'])
  const changed = f.recently_changed && f.last_changed_at
  return (
    <motion.tr
      initial={flash && !reduce ? { backgroundColor: `${accent}40` } : false}
      animate={{ backgroundColor: `${accent}00` }}
      transition={{ duration: 1.6, ease: 'easeOut' }}
      className="border-b border-line/70 align-top last:border-0"
    >
      <td className={cn('py-2.5 pr-3 pl-3 font-medium whitespace-nowrap', changed && 'shadow-[inset_3px_0_0_var(--caution)]')}>{f.id}</td>
      <td className="py-2.5 pr-3">
        <span className="block">{f.subject}</span>
        <span className="block text-sm text-muted-foreground">{f.attribute} · {categoryLabel(f.category)}</span>
        {changed && (
          <span className="mt-1 inline-flex items-center gap-1 rounded-full border border-caution/50 bg-caution/10 px-2 text-sm text-caution" title={fullTime(f.last_changed_at!)}>
            <History className="size-3.5" aria-hidden /> Changed {relativeTime(f.last_changed_at!)}
          </span>
        )}
      </td>
      <td className="py-2.5 pr-3 font-semibold whitespace-nowrap tabular-nums">{formatValue(f.value, f.unit)}</td>
      <td className="py-2.5 pr-3 text-sm leading-6 text-muted-foreground">{f.statement}</td>
      <td className="py-1.5 pr-2 text-right">
        <Button variant="ghost" size="icon" onClick={() => onEdit(f)} aria-label={`Edit ${f.id}`}>
          <Pencil />
        </Button>
      </td>
    </motion.tr>
  )
}

/** The verified facts. The header sticks while the page scrolls. */
export function FactsTable({ facts, onEdit, flashKey }: Props) {
  return (
    <table className="w-full table-fixed text-left">
      <colgroup>
        <col className="w-24" />
        <col className="w-[26%]" />
        <col className="w-30" />
        <col />
        <col className="w-14" />
      </colgroup>
      <thead className="sticky top-0 z-10 bg-surface text-sm text-muted-foreground">
        <tr className="shadow-[inset_0_-1px_0_var(--line)]">
          <th scope="col" className="py-2 pr-3 pl-3 font-medium">ID</th>
          <th scope="col" className="py-2 pr-3 font-medium">Fact</th>
          <th scope="col" className="py-2 pr-3 font-medium">Value</th>
          <th scope="col" className="py-2 pr-3 font-medium">Statement</th>
          <th scope="col" className="py-2 font-medium"><span className="sr-only">Edit</span></th>
        </tr>
      </thead>
      <tbody>
        {facts.map((f) => {
          const flash = !!flashKey?.startsWith(`${f.id}:`)
          return <Row key={flash ? flashKey : f.id} f={f} onEdit={onEdit} flash={flash} />
        })}
      </tbody>
    </table>
  )
}
