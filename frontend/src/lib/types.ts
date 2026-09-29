// Shapes returned by the FastAPI backend (backend/app). Only the fields the UI reads.

export type Strictness = 'strict' | 'balanced' | 'lenient'
export type Status = 'approved' | 'corrected' | 'escalated'
export type Verdict = 'supported' | 'contradicted' | 'unsupported'

export interface GeminiModelStatus {
  model: string
  retry_in_s: number
  reason: string | null
}

export interface ProviderStatus {
  configured: 'gemini' | 'ollama'
  active: 'gemini' | 'ollama'
  running_locally: boolean
  active_model: string
  gemini_retry_in_s: number
  gemini_models: GeminiModelStatus[]
  fallback_enabled: boolean
  fallback_reason: string | null
  rate_limited_recently: boolean
  last_rate_limit_at: string | null
}

export interface Health {
  status: 'ok'
  provider: ProviderStatus
  models: Record<string, string>
  ollama_reachable: boolean
  db: { facts: number; interactions: number }
  chroma: { manual_chunks: number; facts: number; embed_model: string | null }
}

export interface Settings {
  strictness: Strictness
  max_retries: number
  high_risk_categories: string[]
  alert_threshold_pct: number
  alert_window_min: number
}

export interface FailingInteraction {
  id: number
  ts: string
  status: Status
  retries: number
  question: string
}

export interface Alerts {
  active: boolean
  blocked_rate_pct: number | null
  threshold_pct: number
  window_min: number
  total: number
  blocked: number
  min_requests: number
  message: string | null
  recent_failing: FailingInteraction[]
}

export interface ReviewQueue {
  count: number
  items: { id: number; ts: string; question: string; status: Status }[]
}

// ------------------------------------------------------------------ chat (backend/app/schemas.py)

export type Language = 'en' | 'hi' | 'te'
export type Channel = 'console' | 'site' | 'redteam' | 'eval'

export interface Evidence {
  fact_id: string
  statement: string
}

export interface Claim {
  text: string
  text_en: string
  category: string
  verdict: Verdict
  evidence_fact_ids: string[]
  correction: string | null
  span_start: number | null
  span_end: number | null
  caught_by: 'judge' | 'rules' | null
  rule_note: string | null
  evidence: Evidence[]
  manual_section: string | null
}

export interface Draft {
  retry: number
  text: string
  claims: Claim[]
  injected_detail: string | null
}

export interface TrustBreakdown {
  base: number
  contradicted: number
  unsupported: number
  retries: number
  penalties: { contradicted: number; unsupported: number; retries: number }
  escalated: boolean
}

export interface TimingSpan {
  node: string
  attempt: number
  ms: number
  offset_ms: number
  provider: 'gemini' | 'ollama' | null
  cached: boolean | null
}

export interface ChatRequest {
  question: string
  channel?: Channel
  inject?: boolean
  attack_id?: string | null
}

export interface ChatResult {
  interaction_id: number | null
  request_id: string
  status: Status
  final_answer: string
  language: Language
  claims: Claim[]
  drafts: Draft[]
  retries: number
  trust_score: number
  trust_breakdown: TrustBreakdown
  input_flags: string[]
  strictness: Strictness
  timings: { total_ms: number; nodes: Record<string, number>; spans: TimingSpan[] }
  provider: {
    active: 'gemini' | 'ollama'
    active_model: string
    running_locally: boolean
    fallback_reason: string | null
    rate_limited_recently: boolean
  }
  pii_redacted: boolean
  /** Set when every LLM failed: the customer got the hand-off message. */
  error: { kind: string; message: string; provider: string } | null
}

export type NodeName =
  | 'guard_input' | 'retrieve_manual' | 'maker' | 'judge' | 'rule_check' | 'decide' | 'fallback'

export interface NodeEvent {
  node: NodeName
  phase: 'start' | 'end'
  ms: number | null
  payload: Record<string, unknown>
}

/** What /api/chat/stream sends, in order: start, node*, then result (or error). */
export type StreamEvent =
  | { type: 'start'; requestId: string }
  | { type: 'node'; event: NodeEvent }
  | { type: 'result'; result: ChatResult }
  | { type: 'error'; message: string }
