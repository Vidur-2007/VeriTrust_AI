import { FileText, Inbox, ShieldAlert, UserRound } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { toast } from 'sonner'

import { useBackendStatus } from '@/app/BackendStatus'
import { SegmentedControl } from '@/components/SegmentedControl'
import { EmptyState, ErrorState } from '@/components/States'
import { StatusPill } from '@/components/StatusPill'
import { Skeleton } from '@/components/ui/skeleton'
import { FlagChips } from '@/features/console/VerdictPanel'
import { reason } from '@/features/review/resolution'
import { ResolutionForm } from '@/features/review/ResolutionForm'
import { ResultTabs } from '@/features/verdict/ResultTabs'
import { api } from '@/lib/api'
import { fullTime, relativeTime } from '@/lib/format'
import type { Interaction, ReviewResolution } from '@/lib/types'
import { usePolling } from '@/lib/usePolling'
import { cn } from '@/lib/utils'

const CHANNELS: Record<string, string> = { console: 'Live console', site: 'Customer site', redteam: 'Red Team Lab', eval: 'Evaluation' }
const PANEL = 'rounded-xl border border-line bg-surface'

function Why({ item }: { item: Interaction }) {
  return reason(item) === 'operator' ? (
    <span className="inline-flex items-center gap-1 text-sm text-muted-foreground"><UserRound className="size-3.5" aria-hidden /> Sent by an operator</span>
  ) : (
    <span className="inline-flex items-center gap-1 text-sm text-muted-foreground"><ShieldAlert className="size-3.5" aria-hidden /> Escalated by the guardrail</span>
  )
}

function CaseList({ items, selected, onSelect, label }: { items: Interaction[]; selected: number | null; onSelect: (id: number) => void; label: string }) {
  return (
    <ul aria-label={label} className="divide-y divide-line">
      {items.map((i) => (
        <li key={i.id}>
          <button
            type="button"
            onClick={() => onSelect(i.id)}
            aria-current={selected === i.id ? 'true' : undefined}
            className={cn(
              'w-full space-y-1 px-4 py-3 text-left transition-colors hover:bg-surface-2',
              selected === i.id && 'bg-surface-2 shadow-[inset_3px_0_0_var(--accent)]',
            )}
          >
            <span className="line-clamp-2 font-medium" lang={i.language}>{i.question}</span>
            <span className="flex flex-wrap items-center gap-x-2 text-sm text-muted-foreground">
              #{i.id} · {CHANNELS[i.channel] ?? i.channel} · <span title={fullTime(i.ts)}>{relativeTime(i.ts)}</span>
            </span>
            {i.review_status === 'pending' ? <Why item={i} /> : (
              <span className="block truncate text-sm text-muted-foreground">Reply: {i.reviewer_text}</span>
            )}
          </button>
        </li>
      ))}
    </ul>
  )
}

function CaseDetail({ item, onResolve }: { item: Interaction; onResolve?: (body: ReviewResolution) => Promise<void> }) {
  const facts = usePolling(api.facts, 60_000)
  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1 space-y-1.5">
          <h2 className="font-heading text-2xl font-semibold">Case #{item.id}</h2>
          <p className="text-sm text-muted-foreground">
            {CHANNELS[item.channel] ?? item.channel} · {fullTime(item.ts)}
            {item.strictness && ` · ${item.strictness[0].toUpperCase()}${item.strictness.slice(1)} mode`} · {item.retries} {item.retries === 1 ? 'rewrite' : 'rewrites'}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <StatusPill status={item.status} />
            {item.review_status === 'pending' && <Why item={item} />}
            <FlagChips flags={item.input_flags.filter((f) => f !== 'sent_to_review')} inject={item.injected} />
          </div>
        </div>
        <Link to={`/interactions/${item.id}/report`} className="inline-flex items-center gap-1.5 text-beacon underline-offset-4 hover:underline">
          <FileText className="size-4" aria-hidden /> Audit report
        </Link>
      </header>

      <div className="grid gap-4 md:grid-cols-2">
        <section className="space-y-1.5">
          <h3 className="text-sm font-semibold text-muted-foreground">Customer asked</h3>
          <p className="rounded-lg border border-line bg-bg p-3" lang={item.language}>{item.question}</p>
        </section>
        <section className="space-y-1.5">
          <h3 className="text-sm font-semibold text-muted-foreground">
            {item.review_status === 'resolved' ? 'Reply sent by the reviewer' : item.status === 'escalated' ? 'Customer got the hand-off message' : 'Customer got'}
          </h3>
          <p className="rounded-lg border border-line bg-bg p-3" lang={item.language}>{item.reviewer_text ?? item.final_answer}</p>
        </section>
      </div>

      {onResolve && (
        <section aria-label="Resolve this case" className="space-y-3">
          <h3 className="text-lg font-semibold">Resolve</h3>
          {facts.data ? (
            <ResolutionForm key={item.id} item={item} facts={facts.data.items} onSubmit={onResolve} />
          ) : (
            <Skeleton className="h-40 w-full bg-surface-2" />
          )}
        </section>
      )}

      <section aria-label="What the guardrail saw" className="space-y-2">
        <h3 className="text-lg font-semibold">What the guardrail saw</h3>
        <ResultTabs answer={item} answerKey={String(item.id)} />
      </section>
    </div>
  )
}

/** Human review queue (FEATURES #15): escalated answers, resolved by a person. */
export function ReviewQueue() {
  const { review } = useBackendStatus()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const [tab, setTab] = useState<'waiting' | 'resolved'>('waiting')
  const resolved = usePolling(() => api.interactions({ review_status: 'resolved', limit: 50 }), 30_000)
  const [resolvedFull, setResolvedFull] = useState<Record<number, Interaction>>({})

  const waiting = useMemo(() => review.data?.items ?? [], [review.data])
  const selectedId = Number(params.get('id')) || null
  const select = (id: number | null) => setParams((p) => {
    const next = new URLSearchParams(p)
    if (id === null) next.delete('id')
    else next.set('id', String(id))
    return next
  }, { replace: true })

  // Resolved summaries lack drafts and claims: load the full record when one is opened.
  useEffect(() => {
    if (tab !== 'resolved' || !selectedId || resolvedFull[selectedId]) return
    api.interaction(selectedId).then((i) => setResolvedFull((m) => ({ ...m, [i.id]: i }))).catch(() => {})
  }, [tab, selectedId, resolvedFull])

  const list: Interaction[] = tab === 'waiting'
    ? waiting
    : (resolved.data?.items ?? []).map((s) => resolvedFull[s.id] ?? ({ ...s, input_flags: s.flags, drafts: [], claims: [], final_answer: '', reviewer_text: null, timings: null } as unknown as Interaction))
  const current = list.find((i) => i.id === selectedId) ?? list[0]

  const resolve = async (body: ReviewResolution) => {
    if (!current) return
    const r = await api.resolveReview(current.id, body)
    toast.success('Reply approved', { description: `Case #${current.id} is resolved; the customer gets the reply you approved.` })
    if (r.fact) {
      const f = r.fact.fact
      toast.success('Fact saved', {
        description: `${f.id}: ${f.statement}`,
        action: { label: 'Knowledge base', onClick: () => navigate(`/knowledge?fact=${encodeURIComponent(f.id)}`) },
      })
    }
    const next = waiting.find((i) => i.id !== current.id)
    review.refresh()
    resolved.refresh()
    select(next ? next.id : null)
  }

  const loading = tab === 'waiting' ? !review.data : !resolved.data
  const error = tab === 'waiting' ? review.error : resolved.error

  return (
    <div className="grid items-start gap-4 lg:grid-cols-[22rem_minmax(0,1fr)]">
      <section aria-label="Cases" className={cn(PANEL, 'lg:sticky lg:top-0')}>
        <header className="space-y-3 border-b border-line p-4">
          <SegmentedControl
            label="Cases"
            value={tab}
            onChange={(t) => { setTab(t); select(null) }}
            options={[
              { value: 'waiting', label: `Waiting${review.data ? ` (${review.data.count})` : ''}` },
              { value: 'resolved', label: 'Resolved' },
            ]}
            className="w-full"
          />
          <p className="text-sm text-muted-foreground">
            {tab === 'waiting' ? 'Answers the guardrail would not send, or an operator flagged. The customer got the safe hand-off until you resolve them.' : 'Recently resolved cases and the reply that was sent.'}
          </p>
        </header>
        {error && !list.length ? (
          <ErrorState title="Couldn't load the queue" description={error.message} onRetry={tab === 'waiting' ? review.refresh : resolved.refresh} className="m-3" />
        ) : loading ? (
          <div className="space-y-2 p-3" aria-label="Loading cases">
            {Array.from({ length: 3 }, (_, i) => <Skeleton key={i} className="h-20 w-full bg-surface-2" />)}
          </div>
        ) : list.length ? (
          <CaseList items={list} selected={current?.id ?? null} onSelect={select} label={tab === 'waiting' ? 'Waiting cases' : 'Resolved cases'} />
        ) : (
          <p className="p-4 text-muted-foreground">{tab === 'waiting' ? 'Nothing waiting.' : 'No resolved cases yet.'}</p>
        )}
      </section>

      <section aria-label="Case" className={cn(PANEL, 'min-w-0 p-5')}>
        {current ? (
          <CaseDetail key={current.id} item={current} onResolve={current.review_status === 'pending' ? resolve : undefined} />
        ) : loading ? (
          <Skeleton className="h-96 w-full bg-surface-2" />
        ) : (
          <EmptyState
            icon={Inbox}
            title={tab === 'waiting' ? 'No escalations waiting' : 'Nothing resolved yet'}
            description={
              <>
                Escalations arrive here when the guardrail won't send an answer. To create some, run{' '}
                <code className="rounded bg-surface-2 px-1.5">python scripts/seed_review.py</code> in the backend folder, or use{' '}
                <strong>Send to review</strong> on any answer in the <Link to="/" className="text-beacon underline-offset-4 hover:underline">Live console</Link>.
              </>
            }
            className="border-none p-0"
          />
        )}
      </section>
    </div>
  )
}
