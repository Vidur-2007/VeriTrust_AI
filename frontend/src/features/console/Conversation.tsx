import { Globe, MessageSquareText, Square, UserRound, Volume2 } from 'lucide-react'
import { useEffect, useRef } from 'react'

import { ErrorState } from '@/components/States'
import { StatusPill } from '@/components/StatusPill'
import { Button } from '@/components/ui/button'
import { TextShimmer } from '@/components/ui/text-shimmer'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import type { Language } from '@/lib/types'
import { cn } from '@/lib/utils'
import { AnswerText } from './AnswerText'
import { useConsoleSession, type Turn } from './ConsoleSession'
import { useDomain } from '@/app/Domain'
import { examplesFor } from '@/app/domainInfo'
import { languageName } from './language'
import { useReadAloud } from './useSpeech'
import { FlagChips } from './VerdictPanel'

function Examples({ language, onPick }: { language: Language; onPick: (q: string) => void }) {
  const { domain } = useDomain()
  // my-auto centres when there's room and scrolls normally when there isn't (justify-center
  // would push overflowing content above the top, out of reach).
  return (
    <div className="flex min-h-full flex-col">
      <div className="my-auto space-y-4 p-2">
        <div className="flex items-center gap-3">
          <MessageSquareText className="size-6 text-muted-foreground" aria-hidden />
          <div>
            <h2 className="text-lg font-semibold">Ask a customer question</h2>
            <p className="text-muted-foreground">
              Or start with one of these. The answer is checked claim by claim before the customer sees it. {domain.has_site && (
                <> Questions asked on the <a href="/site" target="_blank" rel="noreferrer" className="text-beacon underline-offset-4 hover:underline">customer site</a> show up here live.</>
              )}
            </p>
          </div>
        </div>
        <ul className="grid gap-2">
          {examplesFor(domain, language).map((e) => (
            <li key={e.text}>
              <button
                type="button"
                onClick={() => onPick(e.text)}
                className="w-full rounded-lg border border-line bg-bg px-3 py-2 text-left transition-colors hover:border-beacon/60 hover:bg-surface-2"
              >
                <span className="block" lang={language}>{e.text}</span>
                <span className="text-sm text-muted-foreground">{e.hint}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}

function ReadAloud({ turn, speech }: { turn: Turn; speech: ReturnType<typeof useReadAloud> }) {
  const r = turn.result
  if (!speech.supported || !r) return null
  const speaking = speech.speakingId === turn.id
  const noVoice = !speech.hasVoice(r.language)
  const label = speaking ? 'Stop reading' : 'Read the answer aloud'
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span tabIndex={noVoice ? 0 : -1}>
          <Button
            variant="ghost"
            size="icon-lg"
            aria-label={label}
            disabled={noVoice}
            onClick={(e) => {
              e.stopPropagation()
              if (speaking) speech.stop()
              else speech.speak(turn.id, r.final_answer, r.language)
            }}
          >
            {speaking ? <Square /> : <Volume2 />}
          </Button>
        </span>
      </TooltipTrigger>
      <TooltipContent>{noVoice ? `No ${languageName(r.language)} voice on this device` : label}</TooltipContent>
    </Tooltip>
  )
}

function AssistantBubble({ turn, selected, onSelect, speech }: {
  turn: Turn
  selected: boolean
  onSelect: () => void
  speech: ReturnType<typeof useReadAloud>
}) {
  const { retry } = useConsoleSession()
  const r = turn.result

  if (turn.phase === 'error') {
    return (
      <ErrorState
        title="Couldn't get a verified answer"
        description={turn.error}
        onRetry={() => retry(turn.id)}
        className="max-w-[90%]"
      />
    )
  }

  return (
    <div
      role="button"
      tabIndex={0}
      aria-pressed={selected}
      aria-label="Show this answer's verdict"
      onClick={onSelect}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && e.target === e.currentTarget && (e.preventDefault(), onSelect())}
      className={cn(
        'max-w-[90%] cursor-pointer rounded-xl rounded-tl-sm border bg-bg px-4 py-3 text-left transition-colors',
        selected ? 'border-beacon/70' : 'border-line hover:border-beacon/40',
      )}
    >
      {turn.phase === 'streaming' || !r ? (
        <div className="space-y-2">
          <TextShimmer className="font-medium">Checking claims…</TextShimmer>
          {turn.draft && (
            <p className="text-sm text-muted-foreground">
              <span className="font-medium">Draft {turn.draftRetry + 1}:</span> {turn.draft}
            </p>
          )}
        </div>
      ) : r.status === 'escalated' ? (
        <div className="space-y-2">
          <p lang={r.language}>{r.final_answer}</p>
          <p className="text-sm text-muted-foreground">
            {r.error
              ? `${r.error.message} The customer got the hand-off message, and the case is in the review queue.`
              : 'The draft still failed after the retry limit, so the customer got the hand-off message. The case is in the review queue.'}
          </p>
        </div>
      ) : (
        <AnswerText text={r.final_answer} claims={r.claims} language={r.language} />
      )}
      {r && (
        <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-line pt-2">
          <StatusPill status={r.status} />
          <span className="text-sm text-muted-foreground">Trust {r.trust_score}</span>
          <div className="ml-auto"><ReadAloud turn={turn} speech={speech} /></div>
        </div>
      )}
    </div>
  )
}

/** The customer conversation: questions on the right, verified answers on the left. */
export function Conversation({ language, onPick }: { language: Language; onPick: (q: string) => void }) {
  const { turns, selected, select } = useConsoleSession()
  const speech = useReadAloud()
  const lastRef = useRef<HTMLDivElement>(null)
  const last = turns[turns.length - 1]

  // 'nearest' shows the whole latest turn when it fits; when it's taller than the panel it
  // aligns the question to the top, so the customer's question is never scrolled out of view.
  useEffect(() => {
    lastRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [turns.length, last?.phase, last?.draft])

  if (!turns.length) return <Examples language={language} onPick={onPick} />

  return (
    <div className="space-y-5" aria-live="polite">
      {turns.map((t) => (
        <div key={t.id} ref={t === last ? lastRef : undefined} className="scroll-my-4 space-y-2">
          <div className="flex justify-end">
            <div className="max-w-[85%] space-y-1.5 rounded-xl rounded-tr-sm bg-surface-2 px-4 py-2.5">
              <p className="flex items-start gap-2">
                <UserRound className="mt-1 size-4 shrink-0 text-muted-foreground" aria-hidden />
                <span className="sr-only">Customer: </span>
                <span>{t.question}</span>
              </p>
              {t.source === 'site' && (
                <span className="inline-flex items-center gap-1 rounded-full border border-beacon/50 bg-beacon/10 px-2 text-sm text-beacon">
                  <Globe className="size-3.5" aria-hidden /> From the customer site
                </span>
              )}
              <FlagChips flags={t.result?.input_flags ?? t.flags} inject={t.inject} />
            </div>
          </div>
          <AssistantBubble turn={t} selected={t.id === selected?.id} onSelect={() => select(t.id)} speech={speech} />
        </div>
      ))}
    </div>
  )
}
