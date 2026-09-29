import { emptyTrace, type TraceNodeId, type TraceState } from '@/components/trace/VerificationTrace'
import type { ChatResult, NodeEvent, NodeName, Status } from '@/lib/types'

/** Backend graph nodes -> the five nodes on the trace. guard_input has no node of its own. */
const NODE_MAP: Partial<Record<NodeName, TraceNodeId>> = {
  retrieve_manual: 'retrieve',
  maker: 'maker',
  judge: 'judge',
  rule_check: 'rules',
  fallback: 'decision',
}

function setNode(s: TraceState, id: TraceNodeId, patch: Partial<TraceState['nodes'][TraceNodeId]>): TraceState {
  return { ...s, nodes: { ...s.nodes, [id]: { ...s.nodes[id], ...patch } } }
}

/**
 * Apply one streamed node event to the trace. Pure, so it can be replayed and tested.
 *
 * - A node lights up on `start` and shows its ms on `end`.
 * - `decide` rewrite: Judge turns amber, a retry is counted, the holding-pattern beam flies back
 *   to Maker. The next Maker start ends that beam and clears Judge and Rules for the new draft.
 * - `decide` approve lands the status on Decision; `fallback` lands Escalated.
 */
export function traceReducer(state: TraceState, e: NodeEvent): TraceState {
  let s = state
  if (e.node === 'decide') {
    if (e.phase !== 'end') return s
    const action = e.payload.action as 'approve' | 'rewrite' | 'fallback'
    if (action === 'approve') {
      s = setNode(s, 'decision', { status: 'done', ms: e.ms ?? undefined })
      return { ...s, final: e.payload.status as Status, retrying: false }
    }
    s = setNode(s, 'judge', { status: 'rejected' })
    if (action === 'rewrite') return { ...s, retries: s.retries + 1, retrying: true }
    return s // fallback: the fallback node event lands Escalated
  }

  const id = NODE_MAP[e.node]
  if (!id) return s // guard_input: shown as flags, not a node

  if (e.phase === 'start') {
    if (id === 'maker' && s.retrying) {
      s = { ...s, retrying: false }
      s = setNode(s, 'judge', { status: 'idle' })
      s = setNode(s, 'rules', { status: 'idle' })
    }
    return setNode(s, id, { status: 'active' })
  }

  if (e.node === 'fallback') {
    // Every step still marked running stops (an LLM failure can end the graph mid-step).
    for (const n of ['retrieve', 'maker', 'judge', 'rules'] as const) {
      if (s.nodes[n].status === 'active') s = setNode(s, n, { status: 'idle' })
    }
    s = setNode(s, 'decision', { status: 'done', ms: e.ms ?? undefined })
    return { ...s, final: 'escalated', retrying: false }
  }
  return setNode(s, id, { status: 'done', ms: e.ms ?? undefined })
}

/** The stream failed: nothing is running any more, so no node should keep glowing. */
export function stopActive(state: TraceState): TraceState {
  let s = { ...state, retrying: false }
  for (const n of Object.keys(s.nodes) as TraceNodeId[]) {
    if (s.nodes[n].status === 'active') s = setNode(s, n, { status: 'idle' })
  }
  return s
}

/** The final result is authoritative: it settles the status even if events were missed. */
export function withResult(state: TraceState, r: ChatResult): TraceState {
  const s = setNode(state, 'decision', { status: 'done' })
  return { ...s, final: r.status, retries: Math.max(s.retries, r.retries), retrying: false }
}

export function replay(events: NodeEvent[]): TraceState {
  return events.reduce(traceReducer, emptyTrace())
}
