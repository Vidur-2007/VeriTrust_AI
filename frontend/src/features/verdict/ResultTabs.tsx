import { useState, type ReactNode } from 'react'

import { Tabs, TabsContent, TabsContents, TabsList, TabsTrigger } from '@/components/animate-ui/components/radix/tabs'
import { SegmentedControl } from '@/components/SegmentedControl'
import { AnswerText } from '@/features/console/AnswerText'
import { ClaimList } from '@/features/console/ClaimList'
import { DraftDiff } from '@/features/console/DraftDiff'
import { cn } from '@/lib/utils'
import { caughtEarlier, claimCount, finalClaims, type VerifiedAnswer } from './answer'
import { Waterfall } from './Waterfall'

function FinalClaims({ answer }: { answer: VerifiedAnswer }) {
  const claims = finalClaims(answer)
  const caught = caughtEarlier(answer)
  const final = answer.status === 'escalated' ? `Draft ${answer.drafts.length}: still blocked, not sent` : 'In the answer the customer got'
  if (!caught.length) {
    return claims.length
      ? <ClaimList claims={claims} language={answer.language} />
      : <p className="text-muted-foreground">No factual claims in this answer.</p>
  }
  return (
    <div className="space-y-4">
      {caught.map((d) => (
        <section key={d.draft} className="space-y-2">
          <h3 className="text-sm font-semibold text-stop">Caught in draft {d.draft}, before the customer saw it</h3>
          <ClaimList claims={d.claims} language={answer.language} label={`Caught in draft ${d.draft}`} />
        </section>
      ))}
      <section className="space-y-2">
        <h3 className="text-sm font-semibold text-muted-foreground">{final}</h3>
        {claims.length
          ? <ClaimList claims={claims} language={answer.language} label={final} />
          : <p className="text-muted-foreground">No factual claims.</p>}
      </section>
    </div>
  )
}

function Drafts({ answer }: { answer: VerifiedAnswer }) {
  const { drafts, language } = answer
  const [pick, setPick] = useState(String(drafts.length - 1))
  const current = drafts[Number(pick)] ?? drafts[drafts.length - 1]
  if (!current) return <p className="text-muted-foreground">No drafts were recorded.</p>
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

function Changes({ answer }: { answer: VerifiedAnswer }) {
  const { drafts, status } = answer
  if (!drafts.length) return <p className="text-muted-foreground">No drafts were recorded.</p>
  const escalated = status === 'escalated'
  const last = escalated ? drafts[drafts.length - 1].text : answer.final_answer
  if (drafts.length === 1 && !escalated) {
    return <p className="text-muted-foreground">The first draft was approved; nothing changed.</p>
  }
  return (
    <div className="space-y-2">
      <p className="text-sm text-muted-foreground">
        Draft 1 → {escalated ? `Draft ${drafts.length} (still blocked, so the customer got the hand-off message)` : 'final answer'}.
        Removed words are struck through, added words underlined.
      </p>
      <div className="rounded-lg border border-line bg-bg p-3">
        <DraftDiff before={drafts[0].text} after={last} language={answer.language} />
      </div>
    </div>
  )
}

interface ResultTabsProps {
  /** The verified answer, or undefined while it is still being checked. */
  answer?: VerifiedAnswer
  /** Claims tab content before the answer exists (live claims, skeletons). */
  pendingClaims?: ReactNode
  /** Remounts the drafts picker when the answer changes. */
  answerKey: string
  className?: string
  scrollClassName?: string
}

/** Claims · Drafts · Changes · Timing for one answer: used by the console and the dashboard drawer. */
export function ResultTabs({ answer, pendingClaims, answerKey, className, scrollClassName }: ResultTabsProps) {
  const count = answer ? claimCount(answer) : 0
  const waiting = <p className="text-muted-foreground">This appears when the answer is verified.</p>
  return (
    <Tabs defaultValue="claims" className={cn('gap-0', className)}>
      <TabsList className="w-full">
        <TabsTrigger value="claims">Claims{count ? ` (${count})` : ''}</TabsTrigger>
        <TabsTrigger value="drafts">Drafts{answer?.drafts.length ? ` (${answer.drafts.length})` : ''}</TabsTrigger>
        <TabsTrigger value="changes">Changes</TabsTrigger>
        <TabsTrigger value="timing">Timing</TabsTrigger>
      </TabsList>
      <div className={cn('mt-3', scrollClassName)}>
        <TabsContents>
          <TabsContent value="claims">{answer ? <FinalClaims answer={answer} /> : pendingClaims}</TabsContent>
          <TabsContent value="drafts">{answer ? <Drafts key={answerKey} answer={answer} /> : waiting}</TabsContent>
          <TabsContent value="changes">{answer ? <Changes answer={answer} /> : waiting}</TabsContent>
          <TabsContent value="timing">
            {answer ? <Waterfall spans={answer.timings?.spans ?? []} totalMs={answer.timings?.total_ms} /> : waiting}
          </TabsContent>
        </TabsContents>
      </div>
    </Tabs>
  )
}
