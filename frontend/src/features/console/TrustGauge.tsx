import { motion } from 'motion/react'

import { NumberTicker } from '@/components/ui/number-ticker'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useReduceMotion } from '@/lib/motion'
import type { TrustBreakdown } from '@/lib/types'
import { cn } from '@/lib/utils'

const SIZE = 88
const STROKE = 8
const R = (SIZE - STROKE) / 2

/** Trust colour follows the score band: it is a status, so status colours apply. */
function band(score: number): { stroke: string; text: string } {
  if (score >= 85) return { stroke: 'var(--ok)', text: 'text-ok' }
  if (score >= 60) return { stroke: 'var(--caution)', text: 'text-caution' }
  return { stroke: 'var(--stop-text)', text: 'text-stop' }
}

/** 0-100 radial gauge with the score counting up; hover or focus shows the breakdown. */
export function TrustGauge({ score, breakdown }: { score: number; breakdown?: TrustBreakdown }) {
  const reduce = useReduceMotion()
  const b = band(score)
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div
          tabIndex={0}
          role="img"
          aria-label={`Trust score ${score} out of 100`}
          className="relative grid shrink-0 place-items-center rounded-full"
          style={{ width: SIZE, height: SIZE }}
        >
          <svg width={SIZE} height={SIZE} className="-rotate-90" aria-hidden>
            <circle cx={SIZE / 2} cy={SIZE / 2} r={R} fill="none" stroke="var(--line)" strokeWidth={STROKE} />
            <motion.circle
              cx={SIZE / 2}
              cy={SIZE / 2}
              r={R}
              fill="none"
              stroke={b.stroke}
              strokeWidth={STROKE}
              strokeLinecap="round"
              initial={{ pathLength: 0 }}
              animate={{ pathLength: score / 100 }}
              transition={{ duration: reduce ? 0 : 0.8, ease: 'easeOut' }}
            />
          </svg>
          <div className="absolute inset-0 grid place-items-center text-center leading-none">
            <div>
              <NumberTicker value={score} className={cn('font-heading text-2xl font-bold', b.text)} />
              <p className="mt-0.5 text-sm text-muted-foreground">trust</p>
            </div>
          </div>
        </div>
      </TooltipTrigger>
      <TooltipContent className="w-64">
        {breakdown ? (
          <table className="w-full text-sm tabular-nums">
            <tbody>
              <tr><td>Start</td><td className="text-right">100</td></tr>
              <tr><td>Contradicted × {breakdown.contradicted}</td><td className="text-right">{breakdown.penalties.contradicted}</td></tr>
              <tr><td>Unsupported × {breakdown.unsupported}</td><td className="text-right">{breakdown.penalties.unsupported}</td></tr>
              <tr><td>Retries × {breakdown.retries}</td><td className="text-right">{breakdown.penalties.retries}</td></tr>
              {breakdown.escalated && <tr><td>Escalated</td><td className="text-right">0 overall</td></tr>}
              <tr className="font-semibold"><td>Trust score</td><td className="text-right">{score}</td></tr>
            </tbody>
          </table>
        ) : (
          'Trust score appears when the answer is verified.'
        )}
      </TooltipContent>
    </Tooltip>
  )
}
