import { describe, expect, it } from 'vitest'

import { createSSEParser } from '@/lib/sse'
import type { Attack, AttackResult, InteractionSummary, Scoreboard } from '@/lib/types'
import {
  boardFromHistory, groupState, IDLE_RUN, lastOutcomes, modelFailures, outcomeFromSummary, remaining, runReducer,
  toggleGroup, toRedTeamEvent, type RunState,
} from './runState'

const board = (escaped = 0): Scoreboard => ({
  by_type: { fake_fee: { blocked: 0, corrected: 1, resisted: 0, escaped, total: 1 + escaped } },
  totals: { blocked: 0, corrected: 1, resisted: 0, escaped, total: 1 + escaped }, caught: 1, flagged: 0,
})
const result = (id: string, extra: Partial<AttackResult> = {}): AttackResult => ({
  id, type: 'fake_fee', title: id, expected: 'correct', outcome: 'corrected', status: 'corrected', retries: 1,
  trust_score: 90, flags: [], final_answer: 'ok', interaction_id: 1, ms: 100, error: null, scoreboard: board(), ...extra,
})

describe('runReducer', () => {
  it('follows a run from start to done', () => {
    let s: RunState = runReducer(IDLE_RUN, { type: 'begin', ids: ['ATK-01', 'ATK-02'], at: 0 })
    expect(s).toMatchObject({ phase: 'running', total: 2 })
    s = runReducer(s, { type: 'event', at: 5, event: { type: 'attack_start', id: 'ATK-01', attackType: 'fake_fee', title: 'A', index: 0, total: 2 } })
    expect(s.current).toMatchObject({ id: 'ATK-01', startedAt: 5 })
    s = runReducer(s, { type: 'event', at: 9, event: { type: 'attack_result', result: result('ATK-01') } })
    expect(s.current).toBeNull()
    expect(s.results).toHaveLength(1)
    expect(remaining(s)).toEqual(['ATK-02'])
    s = runReducer(s, { type: 'event', at: 12, event: { type: 'done', scoreboard: board(1), ms: 12 } })
    expect(s).toMatchObject({ phase: 'done', ms: 12 })
    expect(s.scoreboard?.totals.escaped).toBe(1)
  })

  it('keeps partial results when stopped or failed, and ignores late events', () => {
    let s = runReducer(IDLE_RUN, { type: 'begin', ids: ['ATK-01', 'ATK-02'], at: 0 })
    s = runReducer(s, { type: 'event', at: 1, event: { type: 'attack_result', result: result('ATK-01') } })
    const stopped = runReducer(s, { type: 'stop' })
    expect(stopped.phase).toBe('stopped')
    expect(runReducer(stopped, { type: 'event', at: 2, event: { type: 'attack_result', result: result('ATK-02') } }).results).toHaveLength(1)
    const failed = runReducer(s, { type: 'fail', message: 'offline' })
    expect(failed).toMatchObject({ phase: 'failed', error: 'offline' })
    expect(remaining(failed)).toEqual(['ATK-02'])
  })

  it('counts answers handed off because the model failed', () => {
    expect(modelFailures([result('a'), result('b', { error: { kind: 'rate_limit', message: 'x', provider: 'gemini' } })])).toBe(1)
  })
})

describe('outcome from history', () => {
  const row = (id: number, attack_id: string, status: InteractionSummary['status'], contradicted = 0, unsupported = 0) =>
    ({ id, attack_id, status, contradicted, unsupported, ts: `t${id}` }) as InteractionSummary

  it('matches the backend classify()', () => {
    expect(outcomeFromSummary(row(1, 'a', 'escalated'))).toBe('blocked')
    expect(outcomeFromSummary(row(1, 'a', 'corrected'))).toBe('corrected')
    expect(outcomeFromSummary(row(1, 'a', 'approved'))).toBe('resisted')
    expect(outcomeFromSummary(row(1, 'a', 'approved', 0, 1))).toBe('escaped')
  })

  it('keeps the newest outcome per attack and builds a board for the selection', () => {
    const last = lastOutcomes([row(9, 'ATK-01', 'corrected'), row(4, 'ATK-01', 'approved', 1), row(3, 'ATK-02', 'approved')])
    expect(last['ATK-01']).toMatchObject({ outcome: 'corrected', interactionId: 9 })
    const attacks = [{ id: 'ATK-01', type: 'fake_fee' }, { id: 'ATK-02', type: 'fake_fee' }, { id: 'ATK-09', type: 'invented_policy' }] as Attack[]
    const b = boardFromHistory(attacks, last)!
    expect(b.totals).toMatchObject({ corrected: 1, resisted: 1, total: 2 })
    expect(b.by_type.invented_policy).toBeUndefined()
    expect(boardFromHistory([attacks[2]], last)).toBeNull()
  })
})

describe('group selection', () => {
  it('is tri-state and toggles the whole group', () => {
    const ids = ['a', 'b', 'c']
    expect(groupState(ids, new Set())).toBe(false)
    expect(groupState(ids, new Set(['a']))).toBe('indeterminate')
    expect(groupState(ids, new Set(ids))).toBe(true)
    expect([...toggleGroup(ids, new Set(['a', 'x']))].sort()).toEqual(['a', 'b', 'c', 'x'])
    expect([...toggleGroup(ids, new Set(['a', 'b', 'c', 'x']))]).toEqual(['x'])
  })
})

describe('toRedTeamEvent', () => {
  it('parses a stream split mid-event', () => {
    const got: string[] = []
    const parse = createSSEParser((e, d) => {
      const ev = toRedTeamEvent(e, d)
      if (ev) got.push(ev.type === 'attack_start' ? `${ev.type}:${ev.attackType}` : ev.type)
    })
    const text = 'event: start\ndata: {"total":1,"attack_ids":["ATK-01"]}\n\n'
      + 'event: attack_start\ndata: {"id":"ATK-01","type":"fake_fee","title":"A","index":0,"total":1}\n\n'
      + `event: attack_result\ndata: ${JSON.stringify(result('ATK-01'))}\n\n`
      + `event: done\ndata: ${JSON.stringify({ scoreboard: board(), ms: 5 })}\n\n`
    parse(text.slice(0, 70))
    parse(text.slice(70))
    expect(got).toEqual(['start', 'attack_start:fake_fee', 'attack_result', 'done'])
  })
})
