import { EyeOff, FlaskConical, Inbox, ShieldAlert, type LucideIcon } from 'lucide-react'
import { Link } from 'react-router'

import { EmptyState, ErrorState } from '@/components/States'
import { StatusPill } from '@/components/StatusPill'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { clockTime, formatMs, fullTime, relativeTime } from '@/lib/format'
import type { InteractionPage, InteractionSummary } from '@/lib/types'
import { cn } from '@/lib/utils'

const CHANNELS: Record<string, string> = { console: 'Console', site: 'Site', redteam: 'Red team', eval: 'Eval' }

function Flag({ icon: Icon, label }: { icon: LucideIcon; label: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-flex"><Icon className="size-4 text-muted-foreground" aria-hidden /><span className="sr-only">{label}</span></span>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}

function Flags({ row }: { row: InteractionSummary }) {
  return (
    <span className="flex items-center gap-1.5">
      {row.injected && <Flag icon={FlaskConical} label="Error injected" />}
      {row.flags.some((f) => f === 'prompt_injection' || f === 'pressure') && (
        <Flag icon={ShieldAlert} label={row.flags.includes('prompt_injection') ? 'Prompt injection' : 'Pressure'} />
      )}
      {row.flags.includes('pii_redacted') && <Flag icon={EyeOff} label="PII redacted" />}
    </span>
  )
}

interface RecentTableProps {
  page?: InteractionPage
  error?: Error
  loading: boolean
  selectedId: number | null
  onOpen: (id: number) => void
  onMore: () => void
  onRetry: () => void
  filtered: boolean
}

export function RecentTable({ page, error, loading, selectedId, onOpen, onMore, onRetry, filtered }: RecentTableProps) {
  if (error && !page) {
    return <ErrorState title="Couldn't load the interactions" description={error.message} onRetry={onRetry} />
  }
  if (!page) {
    return (
      <div className="space-y-2" aria-label="Loading interactions">
        {Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-11 w-full bg-surface-2" />)}
      </div>
    )
  }
  if (!page.items.length) {
    return filtered ? (
      <EmptyState icon={Inbox} title="Nothing matches" description="No interactions match this filter. Try All, or clear the search." className="border-none p-2" />
    ) : (
      <EmptyState
        icon={Inbox}
        title="No answers yet"
        description="Ask a question in the Live console and it shows up here."
        action={<Button asChild variant="outline"><Link to="/">Open the Live console</Link></Button>}
        className="border-none p-2"
      />
    )
  }

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] table-fixed text-left">
          <colgroup>
            <col className="w-24" />
            <col />
            <col className="w-36" />
            <col className="w-16" />
            <col className="w-18" />
            <col className="w-24" />
            <col className="w-16" />
          </colgroup>
          <thead className="text-sm text-muted-foreground">
            <tr className="border-b border-line">
              <th scope="col" className="py-2 pr-3 font-medium">Time</th>
              <th scope="col" className="py-2 pr-3 font-medium">Question</th>
              <th scope="col" className="py-2 pr-3 font-medium">Status</th>
              <th scope="col" className="py-2 pr-3 text-right font-medium">Trust</th>
              <th scope="col" className="py-2 pr-3 text-right font-medium">Retries</th>
              <th scope="col" className="py-2 pr-3 text-right font-medium">Latency</th>
              <th scope="col" className="py-2 font-medium"><span className="sr-only">Flags</span></th>
            </tr>
          </thead>
          <tbody>
            {page.items.map((r) => (
              <tr
                key={r.id}
                onClick={() => onOpen(r.id)}
                className={cn(
                  'cursor-pointer border-b border-line/70 transition-colors last:border-0 hover:bg-surface-2',
                  selectedId === r.id && 'bg-surface-2',
                )}
              >
                <td className="py-2 pr-3 align-top whitespace-nowrap">
                  <span title={fullTime(r.ts)}>{clockTime(r.ts)}</span>
                  <span className="block text-sm text-muted-foreground">{CHANNELS[r.channel] ?? r.channel}</span>
                </td>
                <td className="py-2 pr-3 align-top">
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); onOpen(r.id) }}
                    className="line-clamp-2 w-full rounded-sm text-left hover:text-beacon"
                    lang={r.language}
                    aria-label={`Open #${r.id}: ${r.question}`}
                  >
                    {r.question}
                  </button>
                  <span className="text-sm text-muted-foreground" title={fullTime(r.ts)}>#{r.id} · {relativeTime(r.ts)}</span>
                </td>
                <td className="py-2 pr-3 align-top"><StatusPill status={r.status} /></td>
                <td className="py-2 pr-3 text-right align-top tabular-nums">{r.trust_score}</td>
                <td className={cn('py-2 pr-3 text-right align-top tabular-nums', r.retries > 0 && 'text-caution')}>{r.retries}</td>
                <td className="py-2 pr-3 text-right align-top whitespace-nowrap tabular-nums">{formatMs(r.total_ms)}</td>
                <td className="py-2 align-top"><Flags row={r} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex items-center justify-between gap-3 text-sm text-muted-foreground">
        <span>Showing {page.items.length} of {page.total}</span>
        {page.items.length < page.total && (
          <Button variant="outline" onClick={onMore} disabled={loading}>Show more</Button>
        )}
      </div>
    </div>
  )
}
