import { useCallback, useEffect, useRef, useState } from 'react'

import { streamChat } from '@/lib/chatStream'
import { mirrorSender } from '@/lib/liveMirror'
import type { Language, StreamEvent } from '@/lib/types'

export interface SiteMessage {
  id: string
  role: 'customer' | 'assistant'
  text: string
  language?: Language
  status: 'pending' | 'done' | 'error'
}

export const SITE_ERROR = "Sorry, I can't reach our assistant right now. Please try again."

/**
 * What the customer's chat keeps from a stream: only the final answer. Verdicts, claims and the
 * trace stay in the ops console (FEATURES #21). Pure, so it can be tested without a network.
 */
export function customerView(e: StreamEvent): Pick<SiteMessage, 'text' | 'language' | 'status'> | null {
  if (e.type === 'result') return { text: e.result.final_answer, language: e.result.language, status: 'done' }
  if (e.type === 'error') return { text: SITE_ERROR, status: 'error' }
  return null
}

/** The customer chat: asks through the same guarded API (channel 'site') and mirrors each
 *  stream to an open ops console tab in this browser. */
export function useSiteChat() {
  const [messages, setMessages] = useState<SiteMessage[]>([])
  const mirror = useRef<ReturnType<typeof mirrorSender> | null>(null)
  const controller = useRef<AbortController | null>(null)

  useEffect(() => {
    mirror.current = mirrorSender()
    return () => {
      controller.current?.abort()
      mirror.current?.close()
    }
  }, [])

  const setAnswer = useCallback((id: string, patch: Partial<SiteMessage>) => {
    setMessages((ms) => ms.map((m) => (m.id === id ? { ...m, ...patch } : m)))
  }, [])

  const ask = useCallback((raw: string, echo: boolean) => {
    const question = raw.trim()
    if (!question) return
    const qid = crypto.randomUUID()
    const aid = `${qid}-a`
    setMessages((ms) => [
      ...ms,
      ...(echo ? [{ id: qid, role: 'customer' as const, text: question, status: 'done' as const }] : []),
      { id: aid, role: 'assistant', text: '', status: 'pending' },
    ])
    const c = new AbortController()
    controller.current = c
    const forward = (event: StreamEvent) => mirror.current?.post({ source: 'site', id: qid, question, event })

    streamChat({ question, channel: 'site' }, {
      signal: c.signal,
      onEvent: (e) => {
        forward(e)
        const view = customerView(e)
        if (view) setAnswer(aid, view)
      },
    }).catch((err: Error) => {
      if (err.name === 'AbortError') return
      forward({ type: 'error', message: err.message })
      setAnswer(aid, { text: SITE_ERROR, status: 'error' })
    })
  }, [setAnswer])

  const send = useCallback((question: string) => ask(question, true), [ask])

  /** Ask the last question again after an error (the question isn't repeated in the chat). */
  const retryLast = useCallback(() => {
    const last = [...messages].reverse().find((m) => m.role === 'customer')
    if (!last) return
    setMessages((ms) => ms.filter((m) => !(m.role === 'assistant' && m.status === 'error')))
    ask(last.text, false)
  }, [messages, ask])

  const waiting = messages.some((m) => m.status === 'pending')
  return { messages, send, retryLast, waiting }
}
