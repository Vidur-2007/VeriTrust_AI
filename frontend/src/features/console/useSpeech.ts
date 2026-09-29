import { useCallback, useEffect, useRef, useState } from 'react'

import type { Language } from '@/lib/types'

/** BCP-47 codes for the Web Speech API. Indian English matches the airline's customers. */
export const SPEECH_LANG: Record<Language, string> = { en: 'en-IN', hi: 'hi-IN', te: 'te-IN' }

// The Web Speech API is not in TypeScript's DOM lib; describe the part we use.
interface RecognitionResultEvent {
  resultIndex: number
  results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }>
}
interface Recognition {
  lang: string
  interimResults: boolean
  continuous: boolean
  onresult: ((e: RecognitionResultEvent) => void) | null
  onerror: ((e: { error: string }) => void) | null
  onend: (() => void) | null
  start: () => void
  stop: () => void
}
type RecognitionCtor = new () => Recognition

function recognitionCtor(): RecognitionCtor | undefined {
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition
}

const MIC_ERRORS: Record<string, string> = {
  'not-allowed': 'Microphone access is blocked. Allow it in the browser to use voice input.',
  'no-speech': "Didn't hear anything. Try again and speak after the tone.",
  'network': 'Speech recognition needs an internet connection in this browser.',
  'language-not-supported': "This browser can't recognise speech in that language.",
}

/** Speech to text (Chrome's webkitSpeechRecognition). `supported` is false elsewhere. */
export function useSpeechRecognition(language: Language, onText: (text: string, final: boolean) => void) {
  const Ctor = recognitionCtor()
  const [listening, setListening] = useState(false)
  const [error, setError] = useState<string>()
  const rec = useRef<Recognition | null>(null)
  const onTextRef = useRef(onText)
  useEffect(() => {
    onTextRef.current = onText
  })

  const stop = useCallback(() => rec.current?.stop(), [])

  const start = useCallback(() => {
    if (!Ctor) return
    setError(undefined)
    const r = new Ctor()
    r.lang = SPEECH_LANG[language]
    r.interimResults = true
    r.continuous = false
    r.onresult = (e) => {
      let text = ''
      let final = false
      for (let i = 0; i < e.results.length; i++) {
        text += e.results[i][0].transcript
        final = e.results[i].isFinal
      }
      onTextRef.current(text, final)
    }
    r.onerror = (e) => setError(MIC_ERRORS[e.error] ?? `Voice input stopped (${e.error}).`)
    r.onend = () => setListening(false)
    rec.current = r
    r.start()
    setListening(true)
  }, [Ctor, language])

  useEffect(() => () => rec.current?.stop(), [])

  return { supported: !!Ctor, listening, error, start, stop }
}

/** Text to speech. `hasVoice(lang)` is false when the device has no voice for that language. */
export function useReadAloud() {
  const supported = typeof window !== 'undefined' && 'speechSynthesis' in window
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>(() => (supported ? speechSynthesis.getVoices() : []))
  const [speakingId, setSpeakingId] = useState<string>()

  useEffect(() => {
    if (!supported) return
    const load = () => setVoices(speechSynthesis.getVoices())
    speechSynthesis.addEventListener('voiceschanged', load)
    return () => {
      speechSynthesis.removeEventListener('voiceschanged', load)
      speechSynthesis.cancel()
    }
  }, [supported])

  const voiceFor = useCallback((language: Language) => {
    const exact = voices.find((v) => v.lang === SPEECH_LANG[language])
    return exact ?? voices.find((v) => v.lang.toLowerCase().startsWith(language))
  }, [voices])

  const speak = useCallback((id: string, text: string, language: Language) => {
    if (!supported) return
    speechSynthesis.cancel()
    const u = new SpeechSynthesisUtterance(text)
    u.lang = SPEECH_LANG[language]
    const voice = voiceFor(language)
    if (voice) u.voice = voice
    u.onend = () => setSpeakingId(undefined)
    u.onerror = () => setSpeakingId(undefined)
    setSpeakingId(id)
    speechSynthesis.speak(u)
  }, [supported, voiceFor])

  const stop = useCallback(() => {
    if (supported) speechSynthesis.cancel()
    setSpeakingId(undefined)
  }, [supported])

  return { supported, speakingId, speak, stop, hasVoice: (l: Language) => !!voiceFor(l) }
}
