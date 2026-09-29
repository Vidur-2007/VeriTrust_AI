import { FileText, Inbox } from 'lucide-react'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Link } from 'react-router'

import { ErrorState } from '@/components/States'
import { StatusPill } from '@/components/StatusPill'
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet'
import { Skeleton } from '@/components/ui/skeleton'
import { AnswerText } from '@/features/console/AnswerText'
import { TrustGauge } from '@/features/console/TrustGauge'
import { FlagChips } from '@/features/console/VerdictPanel'
import { finalClaims } from '@/features/verdict/answer'
import { ResultTabs } from '@/features/verdict/ResultTabs'
import { api } from '@/lib/api'
import { formatMs, fullTime } from '@/lib/format'
import type { Interaction, TrustBreakdown } from '@/lib/types'

const CHANNELS: Record<string, string> = { console: 'Live console', site: 'Customer site', redteam: 'Red Team Lab', eval: 'Evaluation' }

/** Same rule as backend/app/scoring.py, for the gauge's hover breakdown. */
function breakdown(i: Interaction): TrustBreakdown {
  const claims = finalClaims(i)
  const contradicted = claims.filter((c) => c.verdict === 'contradicted').length
  const unsupported = claims.filter((c) => c.verdict === 'unsupported').length
  return {
    base: 100, contradicted, unsupported, retries: i.retries,
    penalties: { contradicted: -40 * contradicted, unsupported: -15 * unsupported, retries: -10 * i.retries },
    escalated: i.status === 'escalated',
  }
}

function Body({ i }: { i: Interaction }) {
  return (
    <div className="space-y-5">
      <header className="flex items-start gap-4 pr-10">
        <div className="min-w-0 flex-1 space-y-2">
          <SheetTitle>Interaction #{i.id}</SheetTitle>
          <SheetDescription>
            {CHANNELS[i.channel] ?? i.channel} · {fullTime(i.ts)}
            {i.strictness && ` · ${i.strictness[0].toUpperCase()}${i.strictness.slice(1)} mode`}
            {i.timings && ` · ${formatMs(i.timings.total_ms)}`}
          </SheetDescription>
          <div className="flex flex-wrap items-center gap-2">
            <StatusPill status={i.status} />
            <FlagChips flags={i.input_flags} inject={i.injected} />
          </div>
        </div>
        <TrustGauge score={i.trust_score} breakdown={breakdown(i)} />
      </header>

      {i.review_status !== 'none' && (
        <p className="flex items-start gap-2 rounded-lg border border-line bg-surface-2 px-3 py-2">
          <Inbox className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
          <span>
            {i.review_status === 'pending' ? 'Waiting in the review queue for a person.' : 'Resolved by a reviewer.'}
            {i.reviewer_text && <span className="block text-muted-foreground">Reply sent: {i.reviewer_text}</span>}
          </span>
        </p>
      )}

      <section className="space-y-1.5">
        <h3 className="text-sm font-semibold text-muted-foreground">Customer asked</h3>
        <p lang={i.language}>{i.question}</p>
      </section>

      <section className="space-y-1.5">
        <h3 className="text-sm font-semibold text-muted-foreground">
          {i.status === 'escalated' ? 'Customer got the hand-off message' : 'Customer got'}
        </h3>
        <div className="rounded-lg border border-line bg-bg p-3">
          {i.status === 'escalated'
            ? <p lang={i.language}>{i.final_answer}</p>
            : <AnswerText text={i.final_answer} claims={i.claims} language={i.language} />}
        </div>
      </section>

      <ResultTabs answer={i} answerKey={String(i.id)} />

      <Link
        to={`/interactions/${i.id}/report`}
        className="inline-flex items-center gap-1.5 text-beacon underline-offset-4 hover:underline"
      >
        <FileText className="size-4" aria-hidden /> Open the audit report
      </Link>
    </div>
  )
}

/** Detail drawer for one interaction: the answer, its claims, drafts, diff and latency waterfall. */
export function InteractionDrawer({ id, onClose }: { id: number | null; onClose: () => void }) {
  const [state, setState] = useState<{ id: number; data?: Interaction; error?: Error } | null>(null)
  const [attempt, setAttempt] = useState(0)

  // The drawer is opened by URL state, not a Radix trigger, so remember what had focus (the row)
  // before the drawer takes it, and give it back on close. Layout effects run before the
  // dialog's own focus effect.
  const opener = useRef<HTMLElement | null>(null)
  useLayoutEffect(() => {
    if (id !== null && !opener.current) opener.current = document.activeElement as HTMLElement | null
  }, [id])

  useEffect(() => {
    if (id === null) return
    let live = true
    api.interaction(id)
      .then((data) => live && setState({ id, data }))
      .catch((error: Error) => live && setState({ id, error }))
    return () => { live = false }
  }, [id, attempt])

  const current = state?.id === id ? state : null

  return (
    <Sheet open={id !== null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent
        aria-describedby={undefined}
        onCloseAutoFocus={(e) => {
          const el = opener.current
          opener.current = null
          if (el?.isConnected && el !== document.body) {
            e.preventDefault()
            el.focus()
          }
        }}
      >
        <div className="min-h-0 flex-1 overflow-y-auto p-6">
          {current?.data ? (
            <Body i={current.data} />
          ) : current?.error ? (
            <>
              <SheetTitle className="mb-4">Interaction #{id}</SheetTitle>
              <ErrorState title="Couldn't load this interaction" description={current.error.message} onRetry={() => setAttempt((n) => n + 1)} />
            </>
          ) : (
            <div className="space-y-4" aria-label="Loading interaction">
              <SheetTitle className="sr-only">Interaction #{id}</SheetTitle>
              <Skeleton className="h-8 w-48 bg-surface-2" />
              <Skeleton className="h-5 w-72 bg-surface-2" />
              <Skeleton className="h-24 w-full bg-surface-2" />
              <Skeleton className="h-48 w-full bg-surface-2" />
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}
