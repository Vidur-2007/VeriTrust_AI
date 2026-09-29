import { Calculator, Copy } from 'lucide-react'
import { Link } from 'react-router'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { formatValue } from '@/lib/format'
import type { AuditFinding } from '@/lib/types'
import { highlightValue, restoreBullets, staleNumbers } from './highlight'

/** One stale manual section: what the manual says, the verified fact, and the proposed fix. */
export function FindingCard({ f }: { f: AuditFinding }) {
  const proposed = restoreBullets(f.proposed_paragraph)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(proposed)
      toast.success('Paragraph copied')
    } catch {
      toast.error("Couldn't copy. Select the text and copy it instead.")
    }
  }

  return (
    <article className="space-y-3 rounded-lg border border-line bg-bg p-4">
      <header className="flex flex-wrap items-start justify-between gap-2">
        <h4 className="font-semibold">{f.section}</h4>
        {f.numeric_check === 'mismatch' && (
          <span className="inline-flex items-center gap-1 rounded-full border border-line bg-surface-2 px-2 text-sm text-muted-foreground">
            <Calculator className="size-3.5" aria-hidden /> Numbers checked by the rule layer
          </span>
        )}
      </header>

      <dl className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1 rounded-md border border-stop/40 bg-stop/5 p-3">
          <dt className="text-sm font-semibold text-stop">Manual says</dt>
          <dd>
            {staleNumbers(f.quote, f.verified_value).map((part, i) =>
              part.match ? (
                <del key={i} className="rounded-sm bg-stop/15 px-0.5 font-semibold text-stop decoration-2">
                  <span className="sr-only">stale value </span>{part.text}
                </del>
              ) : (
                <span key={i}>{part.text}</span>
              ),
            )}
          </dd>
        </div>
        <div className="space-y-1 rounded-md border border-ok/40 bg-ok/5 p-3">
          <dt className="flex flex-wrap items-center gap-2 text-sm font-semibold text-ok">
            Verified fact
            <Link to={`/knowledge?fact=${encodeURIComponent(f.fact_id)}`} className="font-medium text-beacon underline-offset-4 hover:underline">
              {f.fact_id}
            </Link>
          </dt>
          <dd>{f.verified_statement}</dd>
          <dd className="text-sm text-muted-foreground">Value: <span className="font-semibold text-foreground">{formatValue(f.verified_value, f.verified_unit)}</span></dd>
        </div>
      </dl>

      <p className="text-muted-foreground">{f.issue}</p>

      <div className="space-y-1.5">
        <div className="flex items-center justify-between gap-2">
          <h5 className="text-sm font-semibold">Proposed paragraph</h5>
          <Button variant="ghost" size="sm" onClick={copy}><Copy /> Copy</Button>
        </div>
        <p className="rounded-md border border-line bg-surface p-3 whitespace-pre-wrap">
          {highlightValue(proposed, f.verified_value).map((part, i) =>
            part.match ? (
              <mark key={i} className="rounded-sm bg-ok/15 font-semibold text-ok underline decoration-2 underline-offset-4">{part.text}</mark>
            ) : (
              <span key={i}>{part.text}</span>
            ),
          )}
        </p>
      </div>
    </article>
  )
}
