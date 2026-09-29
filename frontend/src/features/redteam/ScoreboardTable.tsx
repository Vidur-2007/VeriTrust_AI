import { NumberTicker } from '@/components/ui/number-ticker'
import type { OutcomeCounts, Scoreboard } from '@/lib/types'
import { cn } from '@/lib/utils'
import { OUTCOME_ORDER, OUTCOMES, TYPE_ORDER, typeLabel } from './runState'

function Cell({ n, escaped }: { n: number; escaped?: boolean }) {
  return (
    <td className={cn('px-3 py-2 text-right tabular-nums', n === 0 && 'text-muted-foreground', escaped && n > 0 && 'bg-stop/10 font-semibold text-stop')}>
      <NumberTicker value={n} startValue={0} />
    </td>
  )
}

function Row({ label, c, strong }: { label: string; c: OutcomeCounts; strong?: boolean }) {
  return (
    <tr className={cn('border-b border-line/70 last:border-0', strong && 'font-semibold')}>
      <th scope="row" className="py-2 pr-3 text-left font-[inherit]">{label}</th>
      {OUTCOME_ORDER.map((o) => <Cell key={o} n={c[o]} escaped={o === 'escaped'} />)}
      <td className="py-2 pl-3 text-right tabular-nums">{c.total}</td>
    </tr>
  )
}

interface Props {
  board: Scoreboard
  /** Answers handed off only because every model failed. */
  modelFailures?: number
}

/** Live scoreboard: headline, then per attack type × outcome. */
export function ScoreboardTable({ board, modelFailures = 0 }: Props) {
  const t = board.totals
  const stopped = t.total - t.escaped
  const types = TYPE_ORDER.filter((x) => board.by_type[x])

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-x-8 gap-y-2">
        <p>
          <span className={cn('font-heading text-5xl leading-none font-bold tabular-nums', t.escaped ? 'text-caution' : 'text-ok')}>
            <NumberTicker value={stopped} startValue={0} />
            <span className="text-3xl text-muted-foreground"> / {t.total}</span>
          </span>
          <span className="mt-1 block text-muted-foreground">attacks stopped before a wrong answer reached the customer</span>
        </p>
        <p>
          <span className={cn('font-heading text-5xl leading-none font-bold tabular-nums', t.escaped ? 'text-stop' : 'text-muted-foreground')}>
            <NumberTicker value={t.escaped} startValue={0} />
          </span>
          <span className="mt-1 block text-muted-foreground">escaped</span>
        </p>
      </div>
      {modelFailures > 0 && (
        <p className="rounded-lg border border-caution/50 bg-caution/10 px-3 py-2 text-sm">
          {modelFailures} {modelFailures === 1 ? 'answer was' : 'answers were'} handed to a person because the model was
          unavailable, not because the guardrail caught something. {modelFailures === 1 ? 'It is' : 'They are'} counted in Caught.
        </p>
      )}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[520px]">
          <thead className="text-sm text-muted-foreground">
            <tr className="border-b border-line">
              <th scope="col" className="py-2 pr-3 text-left font-medium">Attack type</th>
              {OUTCOME_ORDER.map((o) => {
                const Icon = OUTCOMES[o].icon
                return (
                  <th key={o} scope="col" className="px-3 py-2 text-right font-medium" title={OUTCOMES[o].help}>
                    <span className="inline-flex items-center gap-1.5">
                      <Icon className={cn('size-4', OUTCOMES[o].text)} aria-hidden />
                      {OUTCOMES[o].label}
                    </span>
                  </th>
                )
              })}
              <th scope="col" className="py-2 pl-3 text-right font-medium">Total</th>
            </tr>
          </thead>
          <tbody>
            {types.map((type) => <Row key={type} label={typeLabel(type)} c={board.by_type[type]} />)}
            <Row label="All attacks" c={t} strong />
          </tbody>
        </table>
      </div>
    </div>
  )
}
