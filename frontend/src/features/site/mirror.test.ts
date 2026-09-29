import { describe, expect, it } from 'vitest'

import { LIVE_CHANNEL, mirrorSender, subscribeMirror, type MirrorMessage } from '@/lib/liveMirror'
import type { ChatResult } from '@/lib/types'
import { customerView, SITE_ERROR } from './useSiteChat'

describe('customerView', () => {
  it('keeps only the final answer: node events never reach the customer', () => {
    expect(customerView({ type: 'node', event: { node: 'judge', phase: 'end', ms: 5, payload: { claims: [] } } })).toBeNull()
    expect(customerView({ type: 'start', requestId: 'r' })).toBeNull()
    const result = { final_answer: 'You can bring one 7 kg cabin bag.', language: 'en' } as ChatResult
    expect(customerView({ type: 'result', result })).toEqual({ text: 'You can bring one 7 kg cabin bag.', language: 'en', status: 'done' })
    expect(customerView({ type: 'error', message: 'HTTP 500' })).toEqual({ text: SITE_ERROR, status: 'error' })
  })
})

const tick = () => new Promise((r) => setTimeout(r, 30))

describe('live mirror', () => {
  const event = { type: 'start', requestId: 'r1' } as const

  it('delivers site messages from another tab to the console', async () => {
    const got: MirrorMessage[] = []
    const off = subscribeMirror((m) => got.push(m))
    const otherTab = new BroadcastChannel(LIVE_CHANNEL)
    otherTab.postMessage({ source: 'site', tab: 'another-tab', id: 'q1', question: 'Cabin bag?', event })
    await tick()
    otherTab.close()
    off()
    expect(got).toHaveLength(1)
    expect(got[0]).toMatchObject({ id: 'q1', question: 'Cabin bag?', event })
  })

  it("ignores this tab's own messages and anything that isn't a site message", async () => {
    const got: MirrorMessage[] = []
    const off = subscribeMirror((m) => got.push(m))
    const sender = mirrorSender()
    sender.post({ source: 'site', id: 'q2', question: 'Mine', event })  // same tab: ignored
    const other = new BroadcastChannel(LIVE_CHANNEL)
    other.postMessage({ source: 'console', tab: 'x', id: 'q3', question: 'Not site', event })
    other.postMessage({ source: 'site', tab: 'x', id: 'q4', question: 'No event' })
    await tick()
    other.close()
    sender.close()
    off()
    expect(got).toEqual([])
  })
})
