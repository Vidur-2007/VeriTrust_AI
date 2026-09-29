import { MessageCircle, Mic, MicOff, Plane, RotateCcw, Send, X } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useId, useRef, type KeyboardEvent } from 'react'

import { detectLanguage } from '@/features/console/language'
import { useSpeechRecognition } from '@/features/console/useSpeech'
import { useReduceMotion } from '@/lib/motion'
import { cn } from '@/lib/utils'
import { useSiteChat, type SiteMessage } from './useSiteChat'

const STARTERS = [
  'How much cabin baggage can I carry on a domestic flight?',
  'How long does a refund take if I cancel my flight?',
  'My 9-year-old is flying alone to Chennai. What is the fee?',
  'क्या मैं घरेलू उड़ान में अपने कुत्ते को केबिन में ले जा सकता हूँ?',
]

function Typing() {
  const reduce = useReduceMotion()
  return (
    <span className="flex items-center gap-2 text-muted-foreground" role="status">
      <span className="flex gap-1" aria-hidden>
        {[0, 1, 2].map((i) => (
          <motion.span
            key={i}
            className="size-1.5 rounded-full bg-muted-foreground"
            animate={reduce ? undefined : { opacity: [0.3, 1, 0.3] }}
            transition={{ duration: 1, repeat: Infinity, delay: i * 0.15 }}
          />
        ))}
      </span>
      Checking our policies…
    </span>
  )
}

function Bubble({ m, onRetry }: { m: SiteMessage; onRetry: () => void }) {
  if (m.role === 'customer') {
    return <p className="ml-auto max-w-[85%] rounded-2xl rounded-br-sm bg-beacon px-3.5 py-2 text-on-accent">{m.text}</p>
  }
  return (
    <div className="flex max-w-[90%] items-start gap-2">
      <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-full bg-brand-ink text-brand-gold" aria-hidden>
        <Plane className="size-3.5" />
      </span>
      <div className="rounded-2xl rounded-tl-sm border border-line bg-surface-2 px-3.5 py-2">
        {m.status === 'pending' ? <Typing /> : <p lang={m.language}>{m.text}</p>}
        {m.status === 'error' && (
          <button type="button" onClick={onRetry} className="mt-1.5 inline-flex items-center gap-1 text-sm font-medium text-beacon underline-offset-4 hover:underline">
            <RotateCcw className="size-3.5" aria-hidden /> Try again
          </button>
        )}
      </div>
    </div>
  )
}

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  draft: string
  onDraftChange: (text: string) => void
}

/**
 * The customer's chat. It uses the same guarded API as everything else, but the customer only
 * ever sees the final answer: no claims, verdicts or trust score (FEATURES #21).
 */
export function ChatWidget({ open, onOpenChange, draft, onDraftChange }: Props) {
  const { messages, send, retryLast, waiting } = useSiteChat()
  const reduce = useReduceMotion()
  const panelId = useId()
  const launcher = useRef<HTMLButtonElement>(null)
  const box = useRef<HTMLTextAreaElement>(null)
  const end = useRef<HTMLDivElement>(null)
  const lastCustomer = [...messages].reverse().find((m) => m.role === 'customer')
  const mic = useSpeechRecognition(detectLanguage(draft || lastCustomer?.text || ''), (text) => onDraftChange(text))

  useEffect(() => {
    if (open) box.current?.focus()
  }, [open])
  useEffect(() => {
    end.current?.scrollIntoView({ block: 'end', behavior: reduce ? 'auto' : 'smooth' })
  }, [messages, reduce])

  const close = () => {
    onOpenChange(false)
    launcher.current?.focus()
  }
  const submit = (text = draft) => {
    if (!text.trim() || waiting) return
    send(text)
    onDraftChange('')
  }
  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      submit()
    }
  }

  return (
    <div className="fixed right-4 bottom-4 z-40 flex flex-col items-end gap-3 sm:right-6 sm:bottom-6">
      <AnimatePresence>
        {open && (
          <motion.aside
            id={panelId}
            aria-label="Chat with Charminar Airways"
            onKeyDown={(e) => e.key === 'Escape' && close()}
            initial={reduce ? false : { opacity: 0, scale: 0.92, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={reduce ? { opacity: 0, transition: { duration: 0 } } : { opacity: 0, scale: 0.95, y: 8, transition: { duration: 0.15 } }}
            transition={{ type: 'spring', stiffness: 420, damping: 32 }}
            style={{ transformOrigin: 'bottom right' }}
            className={cn(
              'flex flex-col overflow-hidden border border-line bg-surface shadow-[0_18px_48px_-16px_rgba(33,26,82,0.45)]',
              'max-sm:fixed max-sm:inset-0 max-sm:z-50',
              'sm:h-[min(580px,calc(100dvh-8rem))] sm:w-[380px] sm:rounded-2xl',
            )}
          >
            <header className="flex items-center gap-3 bg-brand-ink px-4 py-3 text-white">
              <span className="grid size-9 place-items-center rounded-full bg-brand-gold text-on-gold" aria-hidden>
                <Plane className="size-4.5" />
              </span>
              <div className="min-w-0 flex-1">
                <h2 className="font-semibold">Charminar assistant</h2>
                <p className="text-sm text-brand-gold-soft">Answers checked against our verified policies</p>
              </div>
              <button type="button" onClick={close} aria-label="Close chat" className="grid size-9 place-items-center rounded-full hover:bg-white/10">
                <X className="size-5" aria-hidden />
              </button>
            </header>

            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4" aria-live="polite">
              {!messages.length && (
                <div className="space-y-3">
                  <p>Namaste! Ask me about baggage, changes, refunds or travelling with a pet. I answer in English, हिन्दी or తెలుగు.</p>
                  <ul className="flex flex-wrap gap-2" aria-label="Suggested questions">
                    {STARTERS.map((q) => (
                      <li key={q}>
                        <button
                          type="button"
                          onClick={() => submit(q)}
                          className="rounded-full border border-line bg-bg px-3 py-1.5 text-left text-sm hover:border-beacon"
                          lang={detectLanguage(q)}
                        >
                          {q}
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {messages.map((m) => <Bubble key={m.id} m={m} onRetry={retryLast} />)}
              <div ref={end} />
            </div>

            <form
              className="flex items-end gap-2 border-t border-line p-3"
              onSubmit={(e) => {
                e.preventDefault()
                submit()
              }}
            >
              <label htmlFor={`${panelId}-box`} className="sr-only">Your question</label>
              <textarea
                id={`${panelId}-box`}
                ref={box}
                value={draft}
                onChange={(e) => onDraftChange(e.target.value.slice(0, 500))}
                onKeyDown={onKey}
                rows={1}
                placeholder={mic.listening ? 'Listening…' : 'Type your question'}
                className="max-h-28 min-h-11 flex-1 resize-none rounded-xl border border-line bg-bg px-3 py-2.5 outline-none focus:border-beacon"
              />
              {mic.supported && (
                <button
                  type="button"
                  onClick={mic.listening ? mic.stop : mic.start}
                  aria-pressed={mic.listening}
                  aria-label={mic.listening ? 'Stop listening' : 'Speak your question'}
                  className={cn('grid size-11 shrink-0 place-items-center rounded-xl border border-line', mic.listening && 'border-beacon text-beacon')}
                >
                  {mic.listening ? <MicOff className="size-5" aria-hidden /> : <Mic className="size-5" aria-hidden />}
                </button>
              )}
              <button
                type="submit"
                disabled={!draft.trim() || waiting}
                aria-label="Send"
                className="grid size-11 shrink-0 place-items-center rounded-xl bg-brand-gold text-on-gold transition-colors hover:bg-brand-gold-soft disabled:opacity-50"
              >
                <Send className="size-5" aria-hidden />
              </button>
            </form>
            {mic.error && <p role="alert" className="px-3 pb-2 text-sm text-stop">{mic.error}</p>}
          </motion.aside>
        )}
      </AnimatePresence>

      <button
        ref={launcher}
        type="button"
        onClick={() => (open ? close() : onOpenChange(true))}
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        aria-label={open ? 'Close chat' : 'Chat with us'}
        className={cn(
          'relative grid size-14 place-items-center rounded-full bg-brand-gold text-on-gold shadow-[0_10px_30px_-10px_rgba(33,26,82,0.55)] transition-transform hover:scale-105',
          open && 'max-sm:hidden',
        )}
      >
        {open ? <X className="size-6" aria-hidden /> : <MessageCircle className="size-6" aria-hidden />}
        {!open && !messages.length && <span className="absolute top-1 right-1 size-3 rounded-full border-2 border-brand-gold bg-brand-ink" aria-hidden />}
      </button>
    </div>
  )
}
