import { Crosshair, History, Play, Square } from 'lucide-react'
import { useEffect, useMemo } from 'react'
import { useSearchParams } from 'react-router'

import { EmptyState, ErrorState } from '@/components/States'
import { Button } from '@/components/ui/button'
import { ShimmerButton } from '@/components/ui/shimmer-button'
import { Skeleton } from '@/components/ui/skeleton'
import { InteractionDrawer } from '@/features/dashboard/InteractionDrawer'
import { AttackLibrary } from '@/features/redteam/AttackLibrary'
import { useRedTeam } from '@/features/redteam/RedTeamSession'
import { ResultsList } from '@/features/redteam/ResultsList'
import { RunProgress } from '@/features/redteam/RunProgress'
import { boardFromHistory, lastOutcomes, modelFailures, remaining } from '@/features/redteam/runState'
import { ScoreboardTable } from '@/features/redteam/ScoreboardTable'
import { api } from '@/lib/api'
import { usePolling } from '@/lib/usePolling'

const PANEL = 'rounded-xl border border-line bg-surface'

/** Red Team Lab (FEATURES #9): pick attacks, run them through the guardrail, watch the scoreboard. */
export function RedTeamLab() {
  const { run, selected, setSelected, start, stop } = useRedTeam()
  const [params, setParams] = useSearchParams()
  const openId = Number(params.get('id')) || null
  const open = (id: number | null) => setParams((p) => {
    const next = new URLSearchParams(p)
    if (id === null) next.delete('id')
    else next.set('id', String(id))
    return next
  }, { replace: true })

  const library = usePolling(api.redteamAttacks, 300_000)
  const history = usePolling(() => api.interactions({ channel: 'redteam', limit: 300 }), 30_000)
  const refreshHistory = history.refresh
  useEffect(() => {
    if (run.results.length) refreshHistory()
  }, [run.results.length, refreshHistory])

  const attacks = useMemo(() => library.data?.items ?? [], [library.data])
  const last = useMemo(() => lastOutcomes(history.data?.items ?? []), [history.data])
  const running = run.phase === 'running'
  const chosen = attacks.filter((a) => selected.has(a.id)).map((a) => a.id)
  const past = useMemo(() => boardFromHistory(attacks.filter((a) => selected.has(a.id)), last), [attacks, selected, last])
  const board = run.phase === 'idle' ? past : run.scoreboard
  const rest = remaining(run)

  return (
    <div className="grid items-start gap-4 lg:grid-cols-[26rem_minmax(0,1fr)]">
      <section aria-label="Attack library" className={`${PANEL} lg:sticky lg:top-0 lg:max-h-[calc(100dvh-7.5rem)] lg:overflow-y-auto`}>
        <header className="sticky top-0 z-10 border-b border-line bg-surface px-5 py-3">
          <h2 className="text-base font-semibold">Attack library</h2>
          <p className="text-sm text-muted-foreground">Tricks a real customer might try. Each one goes through the full guardrail.</p>
        </header>
        <div className="p-3">
          {library.error && !library.data ? (
            <ErrorState title="Couldn't load the attacks" description={library.error.message} onRetry={library.refresh} />
          ) : !library.data ? (
            <div className="space-y-2" aria-label="Loading attacks">
              {Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-20 w-full bg-surface-2" />)}
            </div>
          ) : (
            <AttackLibrary attacks={attacks} selected={selected} onChange={setSelected} disabled={running} last={last} />
          )}
        </div>
      </section>

      <div className="min-w-0 space-y-4">
        <section aria-label="Scoreboard" className={PANEL}>
          <header className="flex flex-wrap items-center gap-3 border-b border-line px-5 py-3">
            <div className="mr-auto">
              <h2 className="text-base font-semibold">Scoreboard</h2>
              <p className="text-sm text-muted-foreground">
                {run.phase === 'idle'
                  ? past ? 'From earlier runs of the selected attacks. Run them to update it live.' : 'Updates live as each attack finishes.'
                  : 'This run, updating live as each attack finishes.'}
              </p>
            </div>
            {running ? (
              <Button variant="outline" onClick={stop} className="h-11"><Square /> Stop</Button>
            ) : (
              <>
                {(run.phase === 'stopped' || run.phase === 'failed') && rest.length > 0 && (
                  <Button variant="outline" onClick={() => start(rest)} className="h-11">
                    <Play /> Run the rest ({rest.length})
                  </Button>
                )}
                <ShimmerButton onClick={() => start(chosen)} disabled={!chosen.length} className="h-11">
                  <Crosshair /> {chosen.length ? `Run ${chosen.length} attack${chosen.length === 1 ? '' : 's'}` : 'Select at least one attack'}
                </ShimmerButton>
              </>
            )}
          </header>
          <div className="space-y-5 p-5">
            {run.phase !== 'idle' && <RunProgress run={run} />}
            {run.phase === 'failed' && run.error && (
              <ErrorState title="The run stopped" description={`${run.error} Finished results are kept below.`} />
            )}
            {board ? (
              <ScoreboardTable board={board} modelFailures={run.phase === 'idle' ? 0 : modelFailures(run.results)} />
            ) : running ? (
              <p className="text-muted-foreground">The scoreboard fills in when the first attack finishes.</p>
            ) : (
              <EmptyState
                icon={Crosshair}
                title="No results for these attacks yet"
                description={`Each attack takes 2 to 4 model calls and they run one at a time within the rate limit, so ${chosen.length || 10} attacks take a few minutes. You can leave this page while it runs.`}
                className="border-none p-0"
              />
            )}
          </div>
        </section>

        <section aria-label="Results" className={PANEL}>
          <header className="border-b border-line px-5 py-3">
            <h2 className="text-base font-semibold">Results</h2>
            <p className="text-sm text-muted-foreground">Open any result to see its claims, drafts and timing.</p>
          </header>
          <div className="p-5">
            {run.results.length ? (
              <ResultsList results={run.results} onOpen={open} />
            ) : (
              <p className="flex items-center gap-2 text-muted-foreground">
                <History className="size-4" aria-hidden />
                {running ? 'Results appear here as each attack finishes.' : 'Run attacks to see each answer here. Earlier outcomes show next to each attack in the library.'}
              </p>
            )}
          </div>
        </section>
      </div>

      <InteractionDrawer id={openId} onClose={() => open(null)} />
    </div>
  )
}
