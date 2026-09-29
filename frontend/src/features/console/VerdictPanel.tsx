import { FileText, ShieldCheck } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'

import { Tabs, TabsContent, TabsContents, TabsList, TabsTrigger } from '@/components/animate-ui/components/radix/tabs'
import { SegmentedControl } from '@/components/SegmentedControl'
import { EmptyState } from '@/components/States'
import { StatusPill } from '@/components/StatusPill'
import { BorderBeam } from '@/components/ui/border-beam'
import { Skeleton } from '@/components/ui/skeleton'
import { TextShimmer } from '@/components/ui/text-shimmer'
import type { ChatResult, Claim, Language } from '@/lib/types'
import { cn } from '@/lib/utils'
import { AnswerText } from './AnswerText'
import { ClaimList } from './ClaimList'
import type { Turn } from './ConsoleSession'
import { DraftDiff } from './DraftDiff'
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

function Drafts({ turn }: { turn: Turn }) {
  const drafts = turn.result?.drafts ?? []
  const [pick, setPick] = useState(String(drafts.length - 1))
  const current = drafts[Number(pick)] ?? drafts[drafts.length - 1]
  if (!current) return <p className="text-muted-foreground">Drafts appear when the Maker finishes.</p>
  const language = turn.result?.language ?? 'en'
  return (
    <div className="space-y-3">
      {drafts.length > 1 && (
        <SegmentedControl
          label="Draft"
          value={String(drafts.indexOf(current))}
          onChange={setPick}
          options={drafts.map((d, i) => ({ value: String(i), label: `Draft ${d.retry + 1}` }))}
        />
      )}
      {current.injected_detail && (
        <p className="rounded-lg border border-beacon/40 bg-beacon/10 px-3 py-2 text-sm">
          <span className="font-medium">Injected on purpose:</span> {current.injected_detail}
        </p>
      )}
      <div className="rounded-lg border border-line bg-bg p-3">
        <AnswerText text={current.text} claims={current.claims} language={language} />
      </div>
    </div>
  )
}

function Changes({ turn }: { turn: Turn }) {
  const r = turn.result
  if (!r?.drafts.length) return <p className="text-muted-foreground">Changes appear when the answer is verified.</p>
  const first = r.drafts[0].text
  const escalated = r.status === 'escalated'
  const last = escalated ? r.drafts[r.drafts.length - 1].text : r.final_answer
  if (r.drafts.length === 1 && !escalated) {
    return <p className="text-muted-foreground">The first draft was approved; nothing changed.</p>
  }
  return (
    <div className="space-y-2">
      <p className="text-sm text-muted-foreground">
        Draft 1 → {escalated ? `Draft ${r.drafts.length} (still blocked, so the customer got the hand-off message)` : 'final answer'}.
        Removed words are struck through, added words underlined.
      </p>
      <div className="rounded-lg border border-line bg-bg p-3">
        <DraftDiff before={first} after={last} language={r.language} />
      </div>
    </div>
  )
}

/** Claims the Judge or rules blocked in drafts before the last one: what the guardrail caught. */
function caughtEarlier(r: ChatResult): { draft: number; claims: Claim[] }[] {
  return r.drafts.slice(0, -1)
    .map((d) => ({ draft: d.retry + 1, claims: d.claims.filter((c) => c.verdict !== 'supported') }))
    .filter((d) => d.claims.length)
}

function ClaimsTab({ turn, claims, language }: { turn: Turn; claims: Claim[]; language: Language }) {
  const r = turn.result
  if (!r) {
    const rewriting = turn.phase === 'streaming' && claims.length > 0 && turn.liveClaimsDraft < turn.trace.retries
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

  const caught = caughtEarlier(r)
  const final = r.status === 'escalated' ? `Draft ${r.drafts.length}: still blocked, not sent` : 'In the answer the customer got'
  if (!caught.length) {
    return claims.length ? <ClaimList claims={claims} language={language} /> : <p className="text-muted-foreground">No factual claims in this answer.</p>
  }
  return (
    <div className="space-y-4">
      {caught.map((d) => (
        <section key={d.draft} className="space-y-2">
          <h3 className="text-sm font-semibold text-stop">Caught in draft {d.draft}, before the customer saw it</h3>
          <ClaimList claims={d.claims} language={language} label={`Caught in draft ${d.draft}`} />
        </section>
      ))}
      <section className="space-y-2">
        <h3 className="text-sm font-semibold text-muted-foreground">{final}</h3>
        {claims.length ? (
          <ClaimList claims={claims} language={language} label={final} />
        ) : (
          <p className="text-muted-foreground">No factual claims.</p>
        )}
      </section>
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
  const claims = r ? (r.drafts[r.drafts.length - 1]?.claims ?? r.claims) : turn.liveClaims
  const language = r?.language ?? detectLanguage(turn.question)
  const source = r ? answerSource(r) : null
  const claimCount = claims.length + (r ? caughtEarlier(r).reduce((n, d) => n + d.claims.length, 0) : 0)

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

      <Tabs defaultValue="claims" className="min-h-0 flex-1 gap-0 p-4">
        <TabsList className="w-full">
          <TabsTrigger value="claims">Claims{claimCount ? ` (${claimCount})` : ''}</TabsTrigger>
          <TabsTrigger value="drafts">Drafts{r?.drafts.length ? ` (${r.drafts.length})` : ''}</TabsTrigger>
          <TabsTrigger value="changes">Changes</TabsTrigger>
        </TabsList>
        <div className="-mx-4 mt-3 min-h-0 flex-1 overflow-y-auto px-4">
          <TabsContents>
            <TabsContent value="claims"><ClaimsTab turn={turn} claims={claims} language={language} /></TabsContent>
            <TabsContent value="drafts"><Drafts key={turn.id + (r ? 'r' : '')} turn={turn} /></TabsContent>
            <TabsContent value="changes"><Changes turn={turn} /></TabsContent>
          </TabsContents>
        </div>
      </Tabs>
    </section>
  )
}
