import { Mic, MicOff, Send } from 'lucide-react'
import { useId, type KeyboardEvent } from 'react'

import { useAppState } from '@/app/AppState'
import { Kbd } from '@/components/Kbd'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ShimmerButton } from '@/components/ui/shimmer-button'
import { Textarea } from '@/components/ui/textarea'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import type { Language } from '@/lib/types'
import { cn } from '@/lib/utils'
import { LANGUAGES, languageName } from './language'
import { useSpeechRecognition } from './useSpeech'

const MAX = 1000

interface ComposerProps {
  language: Language
  onLanguage: (l: Language) => void
  value: string
  onChange: (v: string) => void
  onSend: () => void
  busy: boolean
}

/** Question box: language, voice input, text, and Send. Enter sends, Shift+Enter adds a line. */
export function Composer({ language, onLanguage, value, onChange, onSend, busy }: ComposerProps) {
  const { injectEnabled } = useAppState()
  const helpId = useId()
  const mic = useSpeechRecognition(language, (text) => onChange(text.slice(0, MAX)))
  const canSend = !busy && value.trim().length > 0

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      if (canSend) onSend()
    }
  }

  return (
    <div className="space-y-2 border-t border-line p-3">
      <div className="flex items-center gap-2">
        <Select value={language} onValueChange={(v) => onLanguage(v as Language)}>
          <SelectTrigger aria-label="Customer language" className="h-9 w-32"><SelectValue /></SelectTrigger>
          <SelectContent>
            {LANGUAGES.map((l) => (
              <SelectItem key={l.value} value={l.value}><span lang={l.value}>{l.label}</span></SelectItem>
            ))}
          </SelectContent>
        </Select>
        {mic.supported && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant={mic.listening ? 'secondary' : 'ghost'}
                size="icon-lg"
                aria-pressed={mic.listening}
                aria-label={mic.listening ? 'Stop listening' : `Speak in ${languageName(language)}`}
                onClick={mic.listening ? mic.stop : mic.start}
                className={cn(mic.listening && 'text-beacon ring-2 ring-beacon/50')}
              >
                {mic.listening ? <MicOff /> : <Mic />}
              </Button>
            </TooltipTrigger>
            <TooltipContent>{mic.listening ? 'Stop listening' : `Speak in ${languageName(language)}`}</TooltipContent>
          </Tooltip>
        )}
        {injectEnabled && (
          <span className="rounded-full border border-beacon/60 bg-beacon/10 px-2 text-sm text-beacon">
            Error injection on
          </span>
        )}
        <span className="ml-auto text-sm text-muted-foreground tabular-nums" aria-live="off">
          {value.length}/{MAX}
        </span>
      </div>
      <div className="flex items-end gap-2">
        <Textarea
          value={value}
          onChange={(e) => onChange(e.target.value.slice(0, MAX))}
          onKeyDown={onKeyDown}
          rows={2}
          lang={language}
          placeholder={mic.listening ? 'Listening…' : 'Type a customer question'}
          aria-label="Customer question"
          aria-describedby={helpId}
          className="max-h-32 min-h-11 resize-none bg-bg text-base"
        />
        <ShimmerButton onClick={onSend} disabled={!canSend} className="h-11">
          <Send />
          Send
        </ShimmerButton>
      </div>
      <p id={helpId} className="text-sm text-muted-foreground">
        {mic.error ? <span className="text-stop" role="alert">{mic.error}</span> : (
          <><Kbd>Enter</Kbd> sends · <Kbd>Shift</Kbd> + <Kbd>Enter</Kbd> new line · <Kbd>I</Kbd> toggles error injection (outside the box)</>
        )}
      </p>
    </div>
  )
}
