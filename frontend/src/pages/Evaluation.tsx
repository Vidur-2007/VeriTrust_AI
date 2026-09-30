import { FlaskConical, Info, TriangleAlert } from 'lucide-react'
import { useMemo } from 'react'
import { useSearchParams } from 'react-router'

import { Panel } from '@/components/Panel'
import { StatStrip, type Stat } from '@/components/StatStrip'
import { EmptyState, ErrorState } from '@/components/States'
import { Skeleton } from '@/components/ui/skeleton'
import { InteractionDrawer } from '@/features/dashboard/InteractionDrawer'
import { CategoryBars, TypeTable } from '@/features/evaluation/Breakdown'
import { completeQuestions, MODES, questionRows, signedMs } from '@/features/evaluation/evalView'
import { Hero } from '@/features/evaluation/Hero'
import { ModelComparison } from '@/features/evaluation/ModelComparison'
import { QuestionTable } from '@/features/evaluation/QuestionTable'
import { useDomain } from '@/app/Domain'
import { api } from '@/lib/api'
import { formatMs, fullTime, relativeTime } from '@/lib/format'
import type { EvalMetrics } from '@/lib/types'
import { usePolling } from '@/lib/usePolling'

const BASE_COMMAND = 'cd backend && python scripts/run_eval.py --mode all'

function stats(m: EvalMetrics): Stat[] {
  const g = m.modes.guarded
  const inj = m.modes.injected
  // No live (uncached) guarded answers means there is no real latency to compare.
  const lat = signedMs(g?.latency_ms.n === 0 ? null : m.comparison.latency_cost_p50_ms)
  return [
    {
      label: 'Injected errors caught', value: inj?.catch_rate_pct ?? null, suffix: '%',
      sub: inj ? `first drafts with a planted false detail (n=${inj.n - (inj.maker_skipped_injection ?? 0)})` : 'injected mode not run',
      tone: inj?.catch_rate_pct === 100 ? 'ok' : undefined,
    },
    {
      label: 'False blocks', value: g?.false_block_rate_pct ?? null, decimals: 1, suffix: '%',
      sub: 'answerable questions blocked on a first draft that was fine',
    },
    {
      label: 'Correction success', value: inj?.correction_success_pct ?? g?.correction_success_pct ?? null, decimals: 1, suffix: '%',
      sub: 'blocked drafts rewritten until correct',
    },
    {
      label: 'Handed to a person', value: g?.escalation_rate_pct ?? null, decimals: 1, suffix: '%',
      sub: 'guarded answers that ended in the safe hand-off',
    },
    {
      label: 'Latency cost', value: lat.value, prefix: lat.prefix, suffix: lat.suffix, decimals: lat.decimals,
      sub: `median, guarded minus baseline, live timings (n=${g?.latency_ms.n ?? 0})`,
    },
  ]
}

/** Evaluation (FEATURES #14): wrong-answer rate without and with the guardrail, and why. */
export function Evaluation() {
  const data = usePolling(api.evalLatest, 30_000)
  const { domain } = useDomain()
  const COMMAND = domain.id === 'airline' ? BASE_COMMAND : `${BASE_COMMAND} --domain ${domain.id}`
  const [params, setParams] = useSearchParams()
  const openId = Number(params.get('id')) || null
  const open = (id: number | null) => setParams((p) => {
    const next = new URLSearchParams(p)
    if (id === null) next.delete('id')
    else next.set('id', String(id))
    return next
  }, { replace: true })

  const run = data.data?.latest ?? null
  const current = data.data?.current
  const rows = useMemo(() => questionRows(run?.per_question ?? []), [run])
  const modes = MODES.filter((m) => run?.per_question.some((r) => r.mode === m))

  if (data.error && !data.data) {
    return <ErrorState title="Couldn't load the evaluation" description={data.error.message} onRetry={data.refresh} />
  }
  if (!data.data) {
    return (
      <div className="space-y-4" aria-label="Loading evaluation">
        <Skeleton className="h-40 w-full bg-surface" />
        <Skeleton className="h-28 w-full bg-surface" />
        <Skeleton className="h-72 w-full bg-surface" />
      </div>
    )
  }
  if (!run) {
    return (
      <EmptyState
        icon={FlaskConical}
        title="No evaluation yet"
        description={<>Run the {domain.name} evaluation from the backend folder: <code className="rounded bg-surface-2 px-1.5">{COMMAND}</code></>}
      />
    )
  }

  const m = run.metrics
  const complete = completeQuestions(rows, modes)
  const total = m.question_set ?? 80
  const models = Object.entries(m.models_used).map(([k, n]) => `${k === 'ollama' ? 'local model' : k} ×${n}`).join(', ')

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="text-muted-foreground">
          Run #{run.id}, <span title={fullTime(run.ts)}>{relativeTime(run.ts)}</span> · {complete} of {total} questions finished in every mode
          · {m.gemini_only ? 'Gemini only' : 'Gemini with local fallback'} ({models || 'no model calls'})
        </p>
      </div>

      {current?.running && (
        <section aria-label="Evaluation in progress" className="space-y-2 rounded-xl border border-line bg-surface p-4">
          <p className="font-medium" role="status">Evaluating: {current.done} of {current.total} answers</p>
          <div className="h-2 overflow-hidden rounded-full bg-surface-2">
            <div className="h-full rounded-full bg-beacon" style={{ width: `${current.total ? (current.done / current.total) * 100 : 0}%` }} />
          </div>
        </section>
      )}

      {m.skipped > 0 && (
        <div role="status" className="flex items-start gap-3 rounded-xl border border-caution/50 bg-caution/10 px-4 py-3">
          <TriangleAlert className="mt-0.5 size-5 shrink-0 text-caution" aria-hidden />
          <p>
            {m.skipped} answer{m.skipped === 1 ? ' was' : 's were'} skipped because Gemini ran out of free quota or failed; they are not
            counted anywhere. Run <code className="rounded bg-surface-2 px-1.5">{COMMAND}</code> again later to finish: answers
            already done come from the cache.
          </p>
        </div>
      )}

      <Panel title="How often a customer gets a wrong answer">
        <Hero metrics={m} />
      </Panel>

      <StatStrip label="Guardrail numbers" items={stats(m)} />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Panel title="Wrong answers by category">
          <CategoryBars metrics={m} />
        </Panel>
        <Panel title="Wrong answers by question type">
          <TypeTable metrics={m} />
          <p className="mt-4 text-sm text-muted-foreground">
            Latency p50 / p95 (live timings): {modes.map((mode) => `${mode} ${formatMs(m.modes[mode]?.latency_ms.p50)} / ${formatMs(m.modes[mode]?.latency_ms.p95)}`).join(' · ')}.
          </p>
        </Panel>
      </div>

      <ModelComparison comparison={data.data.model_comparison ?? null} progress={data.data.local_progress ?? null} />

      <Panel title={`Questions (${rows.length})`}>
        <QuestionTable rows={rows} modes={modes} onOpen={open} />
      </Panel>

      <p className="flex items-start gap-2 text-sm text-muted-foreground">
        <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
        Each answer is graded by one Judge call against the question's verified facts, then the rule layer. The grader is
        the same model family as the Judge, so a sample of grades was checked by hand (see docs/EVAL_RESULTS.md).
        Latency uses the time each answer took when it was produced live; a replay from the cache counts with that
        earlier live time, or not at all if none was recorded.
      </p>

      <InteractionDrawer id={openId} onClose={() => open(null)} />
    </div>
  )
}
