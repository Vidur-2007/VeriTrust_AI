import { AnimatePresence } from 'motion/react'

import { AnimatedListItem } from '@/components/ui/animated-list'
import type { Claim, Language } from '@/lib/types'
import { cn } from '@/lib/utils'
import { VERDICTS } from '@/lib/verdicts'

/** Claims as the Judge returns them; each slides in as it arrives. */
export function ClaimList({ claims, language, label = 'Claims' }: { claims: Claim[]; language: Language; label?: string }) {
  return (
    <ul className="space-y-2" aria-label={label}>
      <AnimatePresence initial={false}>
        {claims.map((c, i) => {
          const v = VERDICTS[c.verdict]
          const Icon = v.icon
          return (
            <AnimatedListItem key={`${i}-${c.text}`}>
              <li className="rounded-lg border border-line bg-bg p-3">
                <div className="flex items-start gap-2.5">
                  <Icon className={cn('mt-0.5 size-4 shrink-0', v.text)} aria-hidden />
                  <div className="min-w-0 flex-1 space-y-1">
                    <p className="text-sm">
                      <span className={cn('font-semibold', v.text)}>{v.label}</span>
                      <span className="text-muted-foreground"> · {c.category.replace('_', ' ')}</span>
                    </p>
                    <p>{c.text_en || c.text}</p>
                    {language !== 'en' && c.text !== c.text_en && (
                      <p className="text-sm text-muted-foreground" lang={language}>{c.text}</p>
                    )}
                    {c.verdict !== 'supported' && (c.rule_note || c.correction) && (
                      <p className="text-sm"><span className="text-muted-foreground">Fix: </span>{c.rule_note ?? c.correction}</p>
                    )}
                    <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                      {c.evidence_fact_ids.map((id) => (
                        <span key={id} className="rounded-md border border-line bg-surface-2 px-1.5 text-sm text-muted-foreground">{id}</span>
                      ))}
                      {c.caught_by === 'rules' && (
                        <span className="rounded-full border border-stop/50 bg-stop/10 px-2 text-sm font-medium text-stop">Caught by the rule layer</span>
                      )}
                    </div>
                  </div>
                </div>
              </li>
            </AnimatedListItem>
          )
        })}
      </AnimatePresence>
    </ul>
  )
}
