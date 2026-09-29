import { Cpu, TriangleAlert } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'

import { emptyTrace, VerificationTrace } from '@/components/trace/VerificationTrace'
import { Composer } from '@/features/console/Composer'
import { useConsoleSession, type Turn } from '@/features/console/ConsoleSession'
import { Conversation } from '@/features/console/Conversation'
import { VerdictPanel } from '@/features/console/VerdictPanel'
import type { Language } from '@/lib/types'

/** Why an answer didn't come from Gemini, in plain words (or null when it did). */
function providerNotice(turn?: Turn): { tone: 'stop' | 'caution'; text: string } | null {
  const r = turn?.result
  if (!r) return null
  if (r.error) {
    const handed = r.status === 'escalated' ? ' This question was handed to a person.' : ''
    return { tone: 'stop', text: `${r.error.message}${handed}` }
  }
  if (r.provider.active === 'ollama') {
    return {
      tone: 'caution',
      text: `Gemini was busy or rate-limited, so this answer came from the local model (${r.provider.active_model}). It was still verified.`,
    }
  }
  return null
}

function ProviderNotice({ turn }: { turn?: Turn }) {
  const n = providerNotice(turn)
  if (!n) return null
  const Icon = n.tone === 'stop' ? TriangleAlert : Cpu
  return (
    <div
      role="status"
      className={
        n.tone === 'stop'
          ? 'flex items-center gap-3 rounded-xl border border-stop/50 bg-stop/10 px-4 py-2.5'
          : 'flex items-center gap-3 rounded-xl border border-caution/50 bg-caution/10 px-4 py-2.5'
      }
    >
      <Icon className={n.tone === 'stop' ? 'size-5 shrink-0 text-stop' : 'size-5 shrink-0 text-caution'} aria-hidden />
      <p>{n.text}</p>
    </div>
  )
}

/** Toast once per finished turn when the answer didn't come from Gemini. */
function useProviderToasts(turns: Turn[]) {
  const seen = useRef(new Set<string>())
  useEffect(() => {
    for (const t of turns) {
      if (t.phase !== 'done' || seen.current.has(t.id)) continue
      seen.current.add(t.id)
      const n = providerNotice(t)
      if (n?.tone === 'stop') toast.error(n.text)
      else if (n) toast.warning('Answered by the local model', { description: n.text })
    }
  }, [turns])
}

/**
 * Live console (FEATURES #5-8, #12, #13): the verification trace on top, the customer
 * conversation on the left and the verdict for the selected answer on the right.
 */
export function Console() {
  const { turns, selected, busy, send } = useConsoleSession()
  const [language, setLanguage] = useState<Language>('en')
  const [draft, setDraft] = useState('')
  useProviderToasts(turns)

  const submit = (q = draft) => {
    if (!q.trim() || busy) return
    send(q)
    setDraft('')
  }

  return (
    <div className="flex flex-col gap-4 lg:h-full lg:min-h-[560px]">
      <ProviderNotice turn={selected} />

      <section aria-label="Verification trace" className="shrink-0 rounded-xl border border-line bg-surface px-4">
        <VerificationTrace compact state={selected?.trace ?? emptyTrace()} />
      </section>

      <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[minmax(0,11fr)_minmax(0,9fr)]">
        <section aria-label="Customer conversation" className="flex min-h-[420px] flex-col rounded-xl border border-line bg-surface lg:min-h-0">
          <div className="min-h-0 flex-1 overflow-y-auto p-4">
            <Conversation language={language} onPick={(q) => submit(q)} />
          </div>
          <Composer
            language={language}
            onLanguage={setLanguage}
            value={draft}
            onChange={setDraft}
            onSend={() => submit()}
            busy={busy}
          />
        </section>
        <VerdictPanel turn={selected} className="min-h-[420px] lg:min-h-0" />
      </div>
    </div>
  )
}
