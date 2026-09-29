import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createSSEParser, toStreamEvent } from '@/lib/chatStream'
import type { Claim, NodeEvent } from '@/lib/types'
import { segmentText } from './claimSegments'
import { createPacer } from './eventPacer'
import { wordDiff } from './wordDiff'
import { replay, stopActive, traceReducer, withResult } from './traceReducer'

const ev = (node: NodeEvent['node'], phase: NodeEvent['phase'], ms: number | null = null,
  payload: Record<string, unknown> = {}): NodeEvent => ({ node, phase, ms, payload })

const pass = (retry = 0): NodeEvent[] => [
  ev('maker', 'start', null, { retry }), ev('maker', 'end', 3000, { retry, draft: 'd' }),
  ev('judge', 'start', null, { retry }), ev('judge', 'end', 4000, { retry, claims: [] }),
  ev('rule_check', 'start', null, { retry }), ev('rule_check', 'end', 2, { retry, flipped: 0 }),
]
const head: NodeEvent[] = [
  ev('guard_input', 'start'), ev('guard_input', 'end', 0, { flags: [] }),
  ev('retrieve_manual', 'start'), ev('retrieve_manual', 'end', 612),
]

describe('traceReducer', () => {
  it('approved path lights every node and lands Approved', () => {
    const s = replay([...head, ...pass(), ev('decide', 'end', 0, { action: 'approve', status: 'approved' })])
    expect(s.final).toBe('approved')
    expect(s.retries).toBe(0)
    expect(s.nodes.retrieve).toEqual({ status: 'done', ms: 612 })
    expect(Object.values(s.nodes).every((n) => n.status === 'done')).toBe(true)
  })

  it('rewrite draws a holding pattern, then the next draft clears Judge and Rules', () => {
    let s = replay([...head, ...pass(), ev('decide', 'end', 0, { action: 'rewrite' })])
    expect(s.nodes.judge.status).toBe('rejected')
    expect(s.retries).toBe(1)
    expect(s.retrying).toBe(true)
    s = traceReducer(s, ev('maker', 'start', null, { retry: 1 }))
    expect(s.retrying).toBe(false)
    expect(s.nodes.judge.status).toBe('idle')
    expect(s.nodes.rules.status).toBe('idle')
    expect(s.nodes.maker.status).toBe('active')
    s = [...pass(1).slice(1), ev('decide', 'end', 0, { action: 'approve', status: 'corrected' })].reduce(traceReducer, s)
    expect(s.final).toBe('corrected')
    expect(s.retries).toBe(1)
  })

  it('fallback lands Escalated and stops anything still running', () => {
    const s = replay([...head, ev('maker', 'start'), ev('fallback', 'start'), ev('fallback', 'end', 0)])
    expect(s.final).toBe('escalated')
    expect(s.nodes.maker.status).toBe('idle')
    expect(s.nodes.decision.status).toBe('done')
  })

  it('a failed stream leaves nothing glowing', () => {
    const s = stopActive(replay([...head, ev('maker', 'start')]))
    expect(s.nodes.maker.status).toBe('idle')
    expect(s.nodes.retrieve.status).toBe('done')
  })

  it('the result settles the status even if events were missed', () => {
    const s = withResult(replay(head), { status: 'corrected', retries: 1 } as never)
    expect(s.final).toBe('corrected')
    expect(s.retries).toBe(1)
  })
})

describe('SSE parser', () => {
  it('handles blocks split across chunks', () => {
    const got: [string, string][] = []
    const feed = createSSEParser((e, d) => got.push([e, d]))
    feed('event: start\ndata: {"request_id":"r1"}\n\nevent: no')
    feed('de\ndata: {"node":"maker","phase":"start","ms":null,"payload":{}}\n')
    feed('\nevent: result\r\ndata: {"status":"approved"}\r\n\r\n')
    expect(got.map(([e]) => e)).toEqual(['start', 'node', 'result'])
    expect(toStreamEvent(...got[0])).toEqual({ type: 'start', requestId: 'r1' })
    expect(toStreamEvent(...got[1])).toMatchObject({ type: 'node', event: { node: 'maker' } })
    expect(toStreamEvent('error', '{"message":"Boom"}')).toEqual({ type: 'error', message: 'Boom' })
  })
})

describe('segmentText', () => {
  const claim = (s: number | null, e: number | null, verdict: Claim['verdict'] = 'supported'): Claim => ({
    text: '', text_en: '', category: 'fees', verdict, evidence_fact_ids: [], correction: null,
    span_start: s, span_end: e, caught_by: 'judge', rule_note: null, evidence: [], manual_section: null,
  })
  const text = 'Refunds take 7 working days. They go back to your card.'

  it('splits text around claims in order', () => {
    const { segments, unplaced } = segmentText(text, [claim(29, 54), claim(0, 27, 'contradicted')])
    expect(segments.map((s) => s.kind)).toEqual(['claim', 'text', 'claim', 'text'])
    expect(segments[0]).toMatchObject({ text: 'Refunds take 7 working days', index: 1 })
    expect(segments.map((s) => s.text).join('')).toBe(text)
    expect(unplaced).toEqual([])
  })

  it('leaves out overlapping or unlocated claims', () => {
    const { segments, unplaced } = segmentText(text, [claim(0, 27), claim(10, 20), claim(null, null), claim(5, 999)])
    expect(segments.filter((s) => s.kind === 'claim')).toHaveLength(1)
    expect(unplaced).toHaveLength(3)
  })
})

describe('createPacer', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('spaces visible items by the step time and releases the rest at once', () => {
    const out: string[] = []
    const p = createPacer<string>(200, (x) => out.push(x), (x) => x !== 'silent')
    p.push('a'); p.push('silent'); p.push('b'); p.push('c')
    expect(out).toEqual(['a', 'silent'])
    vi.advanceTimersByTime(199)
    expect(out).toEqual(['a', 'silent'])
    vi.advanceTimersByTime(1)
    expect(out).toEqual(['a', 'silent', 'b'])
    vi.advanceTimersByTime(200)
    expect(out).toEqual(['a', 'silent', 'b', 'c'])
  })

  it('holds longer after an item whose step says so', () => {
    const out: string[] = []
    const p = createPacer<string>((x) => (x === 'hold' ? 1000 : 100), (x) => out.push(x))
    p.push('hold'); p.push('b'); p.push('c')
    vi.advanceTimersByTime(999)
    expect(out).toEqual(['hold'])
    vi.advanceTimersByTime(1)
    expect(out).toEqual(['hold', 'b'])
    vi.advanceTimersByTime(100)
    expect(out).toEqual(['hold', 'b', 'c'])
  })

  it('releases everything immediately with a zero step, and stops when cancelled', () => {
    const out: number[] = []
    const p = createPacer<number>(0, (x) => out.push(x))
    p.push(1); p.push(2)
    expect(out).toEqual([1, 2])
    const q = createPacer<number>(100, (x) => out.push(x))
    q.push(3); q.push(4); q.cancel()
    vi.advanceTimersByTime(500)
    expect(out).toEqual([1, 2, 3])
  })
})

describe('wordDiff', () => {
  it('keeps a changed amount as one word', () => {
    const parts = wordDiff('A change fee of ₹2,500 applies.', 'A change fee of ₹3,000 applies.', 'en')
    expect(parts.filter((x) => x.removed).map((x) => x.value)).toEqual(['2,500'])
    expect(parts.filter((x) => x.added).map((x) => x.value)).toEqual(['3,000'])
  })
})
