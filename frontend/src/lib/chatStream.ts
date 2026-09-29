import { ApiError } from '@/lib/api'
import type { ChatRequest, StreamEvent } from '@/lib/types'

/**
 * Incremental parser for server-sent events. Feed it text chunks as they arrive; it calls
 * `onMessage` once per complete `event:`/`data:` block, even when a chunk ends mid-block.
 */
export function createSSEParser(onMessage: (event: string, data: string) => void) {
  let buffer = ''
  return (chunk: string) => {
    buffer += chunk.replace(/\r\n/g, '\n')
    let end: number
    while ((end = buffer.indexOf('\n\n')) >= 0) {
      const block = buffer.slice(0, end)
      buffer = buffer.slice(end + 2)
      let event = 'message'
      const data: string[] = []
      for (const line of block.split('\n')) {
        if (line.startsWith('event:')) event = line.slice(6).trim()
        else if (line.startsWith('data:')) data.push(line.slice(5).replace(/^ /, ''))
      }
      if (data.length) onMessage(event, data.join('\n'))
    }
  }
}

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
export async function streamChat(
  req: ChatRequest,
  { onEvent, signal }: { onEvent: (e: StreamEvent) => void; signal?: AbortSignal },
): Promise<void> {
  let res: Response
  try {
    res = await fetch('/api/chat/stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
      body: JSON.stringify({ channel: 'console', ...req }),
      signal,
    })
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e
    throw new ApiError(0, "Can't reach the backend. Start it with: uvicorn app.main:app --port 8000")
  }
  if (!res.ok || !res.body) {
    let message = `The server answered ${res.status}.`
    try {
      const detail = (await res.json()).detail
      message = typeof detail === 'string' ? detail : detail?.[0]?.msg ?? message
    } catch {
      // not JSON
    }
    throw new ApiError(res.status, message)
  }

  const parse = createSSEParser((event, data) => {
    const e = toStreamEvent(event, data)
    if (e) onEvent(e)
  })
  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    parse(decoder.decode(value, { stream: true }))
  }
  parse(decoder.decode() + '\n\n')
}
