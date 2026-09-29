import { BarChart3 } from 'lucide-react'
import { useId } from 'react'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

import { ChartTooltipBox } from '@/components/charts/ChartTooltip'
import { useTokenValues } from '@/lib/useTokens'
import type { Bucket } from './series'

const TOKENS = ['--line', '--text-muted', '--ok', '--caution', '--stop', '--surface']

/**
 * Status series differ by pattern as well as colour: approved solid, corrected hatched,
 * escalated dotted, so the chart still reads without colour.
 */
function Patterns({ c, id }: { c: Record<string, string>; id: string }) {
  return (
    <defs>
      <pattern id={`${id}-corrected`} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
        <rect width="6" height="6" fill={c['--caution']} />
        <rect width="2" height="6" fill={c['--surface']} opacity="0.55" />
      </pattern>
      <pattern id={`${id}-escalated`} width="5" height="5" patternUnits="userSpaceOnUse">
        <rect width="5" height="5" fill={c['--stop']} />
        <circle cx="2.5" cy="2.5" r="1.1" fill={c['--surface']} opacity="0.7" />
      </pattern>
    </defs>
  )
}

export function Swatch({ kind }: { kind: 'approved' | 'corrected' | 'escalated' }) {
  const c = useTokenValues(TOKENS)
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, '')
  return (
    <svg width="14" height="14" aria-hidden className="shrink-0 rounded-sm">
      <Patterns c={c} id={id} />
      <rect width="14" height="14" rx="2" fill={kind === 'approved' ? c['--ok'] : `url(#${id}-${kind})`} />
    </svg>
  )
}

const SERIES = [
  { key: 'approved', label: 'Approved' },
  { key: 'corrected', label: 'Corrected' },
  { key: 'escalated', label: 'Escalated' },
] as const

/** Approved vs blocked answers over time: a stacked bar per bucket. */
export function OutcomeChart({ buckets, bucketMin }: { buckets: Bucket[]; bucketMin: number }) {
  const c = useTokenValues(TOKENS)
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, '')
  const total = buckets.reduce((n, b) => n + b.total, 0)
  const tickEvery = Math.max(1, Math.round(buckets.length / 6))

  return (
    <div className="space-y-3">
      <ul className="flex flex-wrap gap-x-5 gap-y-1 text-sm" aria-label="Legend">
        {SERIES.map((s) => (
          <li key={s.key} className="flex items-center gap-2"><Swatch kind={s.key} />{s.label}</li>
        ))}
      </ul>
      <div className="relative h-56" role="img" aria-label={`Answers per ${bucketMin === 1 ? 'minute' : `${bucketMin} minutes`}: ${buckets.reduce((n, b) => n + b.approved, 0)} approved, ${buckets.reduce((n, b) => n + b.corrected, 0)} corrected, ${buckets.reduce((n, b) => n + b.escalated, 0)} escalated`}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={buckets} margin={{ top: 4, right: 4, bottom: 0, left: -20 }} barCategoryGap={bucketMin === 1 ? 1 : 3}>
            <Patterns c={c} id={id} />
            <CartesianGrid stroke={c['--line']} vertical={false} />
            <XAxis dataKey="label" stroke={c['--line']} tick={{ fill: c['--text-muted'], fontSize: 14 }} tickLine={false} interval={tickEvery - 1} />
            <YAxis stroke={c['--line']} tick={{ fill: c['--text-muted'], fontSize: 14 }} tickLine={false} allowDecimals={false} width={48} />
            <Tooltip
              cursor={{ fill: c['--line'], opacity: 0.35 }}
              content={({ active, payload }) => {
                const b = active ? (payload?.[0]?.payload as Bucket | undefined) : undefined
                if (!b) return null
                return (
                  <ChartTooltipBox
                    title={bucketMin === 1 ? b.label : `${b.label} + ${bucketMin} min`}
                    rows={SERIES.map((s) => ({ label: s.label, value: b[s.key], swatch: <Swatch kind={s.key} /> }))}
                  />
                )
              }}
            />
            <Bar dataKey="approved" stackId="a" fill={c['--ok']} isAnimationActive={false} />
            <Bar dataKey="corrected" stackId="a" fill={`url(#${id}-corrected)`} isAnimationActive={false} />
            <Bar dataKey="escalated" stackId="a" fill={`url(#${id}-escalated)`} radius={[2, 2, 0, 0]} isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
        {total === 0 && (
          <div className="absolute inset-0 grid place-items-center">
            <p className="flex items-center gap-2 rounded-lg border border-line bg-surface px-3 py-2 text-muted-foreground">
              <BarChart3 className="size-4" aria-hidden /> No answers in this period.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
