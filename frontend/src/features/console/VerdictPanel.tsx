import { FileText, ShieldCheck } from 'lucide-react'
import { Link } from 'react-router'

import { EmptyState } from '@/components/States'
import { StatusPill } from '@/components/StatusPill'
import { BorderBeam } from '@/components/ui/border-beam'
import { Skeleton } from '@/components/ui/skeleton'
import { TextShimmer } from '@/components/ui/text-shimmer'
import { ResultTabs } from '@/features/verdict/ResultTabs'
import type { ChatResult, Language } from '@/lib/types'
import { cn } from '@/lib/utils'
import { ClaimList } from './ClaimList'
import type { Turn } from './ConsoleSession'
import { detectLanguage, FLAG_LABELS } from './language'
import { TrustGauge } from './TrustGauge'

/** Where this answer's LLM calls were served from (its own timing spans, not the current state). */
function answerSource(r: ChatResult): string {
  const calls = r.timings.spans.filter((s) => s.provider)
  if (!calls.length) return 'no model call'
  if (calls.every((s) => s.cached)) return 'from cache'
  return calls.some((s) => s.provider === 'ollama' && !s.cached) ? 'local model (Gemma)' : 'Gemini'
}

const PANEL = 'relative flex min-h-0 flex-col rounded-xl border border-line bg-surface'

export function FlagChips({ flags, inject }: { flags: string[]; inject?: boolean }) {
  const shown = flags.filter((f) => FLAG_LABELS[f])
  if (!shown.length && !inject) return null
  return (
    <div className="flex flex-wrap gap-1.5">
      {inject && <span className="rounded-full border border-beacon/50 bg-beacon/10 px-2 text-sm text-beacon">Error injected</span>}
      {shown.map((f) => (
        <span
          key={f}
          className={cn(
            'rounded-full border px-2 text-sm',
            f === 'pii_redacted' ? 'border-line bg-surface-2 text-muted-foreground' : 'border-caution/50 bg-caution/10 text-caution',
          )}
        >
          {FLAG_LABELS[f]}
        </span>
      ))}
    </div>
  )
}

/** Claims tab while the turn is still being checked: live claims from the Judge, or skeletons. */
function PendingClaims({ turn, language }: { turn: Turn; language: Language }) {
  const claims = turn.liveClaims
  if (!claims.length) {
    return turn.phase === 'streaming' ? (
      <div className="space-y-2" aria-label="Loading claims">
        <Skeleton className="h-16 w-full bg-surface-2" />
        <Skeleton className="h-16 w-full bg-surface-2" />
      </div>
    ) : (
      <p className="text-muted-foreground">No claims were checked.</p>
    )
  }
  const rewriting = turn.phase === 'streaming' && turn.liveClaimsDraft < turn.trace.retries
  return (
    <div className="space-y-2">
      {rewriting && (
        <p className="text-sm text-caution" role="status">
          Draft {turn.liveClaimsDraft + 1} was blocked. The Maker is rewriting it with this feedback.
        </p>
      )}
      <ClaimList claims={claims} language={language} />
    </div>
  )
}

/** Verdict for the selected turn: status, trust score, claims, drafts and the diff. */
export function VerdictPanel({ turn, className }: { turn?: Turn; className?: string }) {
  if (!turn) {
    return (
      <section aria-label="Verdict" className={cn(PANEL, 'p-5', className)}>
        <EmptyState
          icon={ShieldCheck}
          title="Ask a question to see how each claim is checked"
          description="Every factual claim in the answer is listed here with the verified fact it was checked against, the drafts, and what changed."
          className="border-none p-0"
        />
      </section>
    )
  }
  const r = turn.result
  const streaming = turn.phase === 'streaming'
  const language = r?.language ?? detectLanguage(turn.question)
  const source = r ? answerSource(r) : null

  return (
    <section aria-label="Verdict" className={cn(PANEL, className)}>
      {streaming && <BorderBeam />}
      <header className="flex items-center gap-4 border-b border-line p-4">
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="h-7">
            {streaming ? (
              <TextShimmer className="font-semibold">Checking claims…</TextShimmer>
            ) : r ? (
              <StatusPill status={r.status} />
            ) : (
              <p className="font-semibold text-stop">Not verified</p>
            )}
          </div>
          {r && (
            <p className="text-sm text-muted-foreground">
              {r.strictness[0].toUpperCase() + r.strictness.slice(1)} mode · {source} · {(r.timings.total_ms / 1000).toFixed(1)} s
              {r.interaction_id && (
                <> · <Link to={`/interactions/${r.interaction_id}/report`} className="text-beacon underline-offset-4 hover:underline"><FileText className="-mt-0.5 mr-0.5 inline size-3.5" aria-hidden />#{r.interaction_id}</Link></>
              )}
            </p>
          )}
          <FlagChips flags={r?.input_flags ?? turn.flags} />
        </div>
        {r ? (
          <TrustGauge score={r.trust_score} breakdown={r.trust_breakdown} />
        ) : (
          <div className="size-[88px] shrink-0 rounded-full border-8 border-line" aria-hidden />
        )}
      </header>

      <ResultTabs
        answer={r}
        answerKey={turn.id + (r ? 'r' : '')}
        pendingClaims={<PendingClaims turn={turn} language={language} />}
        className="min-h-0 flex-1 p-4"
        scrollClassName="-mx-4 min-h-0 flex-1 overflow-y-auto px-4"
      />
    </section>
  )
}
