import { Cpu, Loader } from 'lucide-react'

import { Panel } from '@/components/Panel'
import { formatMs, fullTime, relativeTime } from '@/lib/format'
import type { LocalEvalProgress, ModelComparison as Comparison } from '@/lib/types'
import { cn } from '@/lib/utils'
import { comparisonRows, type ComparisonRow } from './evalView'

const COMMAND = 'cd backend && python scripts/run_eval.py --provider ollama --sample 24'

function Value({ row, side }: { row: ComparisonRow; side: 'gemini' | 'local' }) {
  const v = row[side]
  const text = v === null ? '–' : row.unit === 'ms' ? formatMs(v) : `${v.toFixed(1)}%`
  const better = row.better === side
  return (
    <td className={cn('px-3 py-2.5 text-right tabular-nums', v === null && 'text-muted-foreground', better && 'font-semibold')}>
      {text}
      {/* Reserve the space in every cell so the numbers stay in one column. */}
      <span className={cn('ml-2 inline-block w-12 text-left text-sm font-normal text-ok', !better && 'invisible')} aria-hidden={!better}>better</span>
    </td>
  )
}

function Progress({ p }: { p: LocalEvalProgress }) {
  if (p.state === 'finished') return null
  const of = p.total ? `${p.done} of ${p.total} answers` : `${p.done} answers`
  return (
    <p role="status" className="flex items-center gap-2 text-sm">
      {p.state === 'running' ? <Loader className="size-4 shrink-0 animate-spin text-beacon" aria-hidden /> : <Cpu className="size-4 shrink-0 text-caution" aria-hidden />}
      {p.state === 'running'
        ? <>Local run in progress: {of}. Last answer <span title={fullTime(p.updated_at)}>{relativeTime(p.updated_at)}</span>. The table updates when the run finishes.</>
        : <>The local run stopped at {of}. Run the command again to continue; finished answers come from the cache.</>}
    </p>
  )
}

/** Gemini vs the local model (FEATURES #26) on the answers Gemini graded in both runs. */
export function ModelComparison({ comparison, progress }: { comparison: Comparison | null; progress: LocalEvalProgress | null }) {
  const model = comparison?.ollama.model ?? 'local model'
  const c = comparison
  return (
    <Panel title="Gemini vs the local model">
      <div className="space-y-4">
        {progress && <Progress p={progress} />}

        {!c ? (
          !progress && (
            <p className="text-muted-foreground">
              No local run yet. Run the same questions with the local model (Ollama) as Maker and Judge:{' '}
              <code className="rounded bg-surface-2 px-1.5">{COMMAND}</code>. It takes hours and can be stopped and continued.
            </p>
          )
        ) : c.paired_answers === 0 ? (
          <p className="text-muted-foreground">
            The local model answered {c.answers - c.failed} of {c.answers} runs, but Gemini hasn't graded any yet
            ({c.waiting_for_grade} waiting, usually for free quota). Run the command again later to grade them from the cache.
          </p>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[34rem]">
                <thead className="text-sm text-muted-foreground">
                  <tr className="border-b border-line">
                    <th scope="col" className="py-2 pr-3 text-left font-medium">On the same {c.paired_questions} question{c.paired_questions === 1 ? '' : 's'}</th>
                    <th scope="col" className="px-3 py-2 text-right font-medium">Gemini<span className="ml-2 inline-block w-12" aria-hidden /></th>
                    <th scope="col" className="px-3 py-2 text-right font-medium">{model} (local)<span className="ml-2 inline-block w-12" aria-hidden /></th>
                  </tr>
                </thead>
                <tbody>
                  {comparisonRows(c).map((row) => (
                    <tr key={row.label} className="border-b border-line/70 last:border-0">
                      <th scope="row" className="py-2.5 pr-3 text-left font-medium">
                        {row.label}
                        <span className="block text-sm font-normal text-muted-foreground">{row.help}</span>
                      </th>
                      <Value row={row} side="gemini" />
                      <Value row={row} side="local" />
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-sm text-muted-foreground">
              {c.paired_answers} answers graded in both runs ({c.paired_questions} question{c.paired_questions === 1 ? '' : 's'}), all graded by Gemini so the rates are comparable.
              In the local run {model} is both Maker and Judge. Local run #{c.ollama.run_id},{' '}
              <span title={fullTime(c.ollama.ts)}>{relativeTime(c.ollama.ts)}</span>; Gemini run #{c.gemini.run_id}.
              {c.waiting_for_grade > 0 && ` ${c.waiting_for_grade} local answer${c.waiting_for_grade === 1 ? ' is' : 's are'} still waiting for a Gemini grade and ${c.waiting_for_grade === 1 ? 'is' : 'are'} not counted.`}
              {c.failed > 0 && ` ${c.failed} time${c.failed === 1 ? '' : 's'} the local model produced no usable answer; ${c.failed === 1 ? 'that is' : 'those are'} not counted either.`}
            </p>
          </>
        )}
      </div>
    </Panel>
  )
}
