import { postSSE } from '@/lib/sse'
import type { ChatRequest, StreamEvent } from '@/lib/types'

export { createSSEParser } from '@/lib/sse'

export function toStreamEvent(event: string, data: string): StreamEvent | null {
  const body = JSON.parse(data)
  switch (event) {
    case 'start':
      return { type: 'start', requestId: body.request_id }
    case 'node':
      return { type: 'node', event: body }
    case 'result':
      return { type: 'result', result: body }
    case 'error':
      return { type: 'error', message: body.message ?? 'Something went wrong. Please try again.' }
    default:
      return null
  }
}

/** POST /api/chat/stream and call `onEvent` for every event until the stream ends. */
export function streamChat(
  req: ChatRequest,
  { onEvent, signal }: { onEvent: (e: StreamEvent) => void; signal?: AbortSignal },
): Promise<void> {
  return postSSE('/chat/stream', { channel: 'console', ...req }, {
    signal,
    onMessage: (event, data) => {
      const e = toStreamEvent(event, data)
      if (e) onEvent(e)
    },
  })
}
