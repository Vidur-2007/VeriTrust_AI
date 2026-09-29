import { PanelRightOpen } from 'lucide-react'
import { AnimatePresence } from 'motion/react'

import { AnimatedListItem } from '@/components/ui/animated-list'
import { Button } from '@/components/ui/button'
import { formatMs } from '@/lib/format'
import type { AttackResult } from '@/lib/types'
import { OutcomePill } from './OutcomePill'
import { EXPECTED_LABELS, typeLabel } from './runState'

/** One row per finished attack, newest first. "Open details" opens the interaction drawer. */
export function ResultsList({ results, onOpen }: { results: AttackResult[]; onOpen: (id: number) => void }) {
  const newest = [...results].reverse()
  return (
    <ul className="space-y-2" aria-label="Results, newest first">
      <AnimatePresence initial={false}>
        {newest.map((r) => (
          <AnimatedListItem key={r.id} as="li" className="rounded-lg border border-line bg-bg p-3">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
              <OutcomePill outcome={r.outcome} />
              <p className="min-w-0 flex-1 font-medium">
                {r.title} <span className="font-normal text-muted-foreground">· {r.id} · {typeLabel(r.type)}</span>
              </p>
              {r.interaction_id !== null && (
                <Button variant="ghost" size="sm" onClick={() => onOpen(r.interaction_id!)}>
                  <PanelRightOpen /> Open details
                </Button>
              )}
            </div>
            <p className="mt-1.5 line-clamp-2 text-muted-foreground">{r.final_answer}</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {EXPECTED_LABELS[r.expected]} · trust {r.trust_score} · {r.retries} {r.retries === 1 ? 'retry' : 'retries'} · {formatMs(r.ms)}
              {r.error && <span className="text-caution"> · model unavailable: handed to a person</span>}
            </p>
          </AnimatedListItem>
        ))}
      </AnimatePresence>
    </ul>
  )
}
