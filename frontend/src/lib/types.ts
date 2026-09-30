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

/** GET /review: escalated conversations waiting for a person, with their full records. */
export interface ReviewQueue {
  count: number
  items: Interaction[]
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

// ------------------------------------------------------------------ dashboard (analytics.py)

export interface TimeseriesPoint {
  minute: string
  total: number
  approved: number
  corrected: number
  escalated: number
  blocked: number
  p95_ms: number | null
}

export interface Metrics {
  window_min: number | null
  channels: string[]
  total: number
  counts: Record<Status, number>
  rates_pct: Record<Status, number | null>
  blocked: number
  blocked_rate_pct: number | null
  avg_trust: number | null
  latency_ms: { avg: number | null; p50: number | null; p95: number | null }
  node_avg_ms: Partial<Record<NodeName, number>>
  injected: { total: number; caught: number; catch_rate_pct: number | null }
  caught_by: { judge: number; rules: number }
  flagged_inputs: number
  timeseries: TimeseriesPoint[]
}

export interface InteractionSummary {
  id: number
  ts: string
  channel: Channel
  question: string
  language: Language
  status: Status
  trust_score: number
  retries: number
  injected: boolean
  attack_id: string | null
  review_status: 'none' | 'pending' | 'resolved'
  strictness: Strictness | null
  flags: string[]
  total_ms: number | null
  contradicted: number
  unsupported: number
}

export interface InteractionPage {
  total: number
  limit: number
  offset: number
  items: InteractionSummary[]
}

/** GET /interactions/{id}: the stored row. */
export interface Interaction {
  id: number
  ts: string
  channel: Channel
  question: string
  language: Language
  status: Status
  final_answer: string
  claims: Claim[]
  drafts: Draft[]
  retries: number
  trust_score: number
  injected: boolean
  attack_id: string | null
  input_flags: string[]
  strictness: Strictness | null
  review_status: 'none' | 'pending' | 'resolved'
  reviewer_text: string | null
  timings: { total_ms: number; nodes: Record<string, number>; spans: TimingSpan[] } | null
}

// ------------------------------------------------------------------ knowledge base

/** A fact category of the active domain pack (the airline's: baggage, fees, refunds …). */
export type FactCategory = string

/** A domain pack (FEATURES #25): a company's knowledge base the same guardrail can run over. */
export interface DomainInfo {
  id: string
  name: string
  industry: string
  /** Verified facts loaded for the pack; 0 means it hasn't been seeded. */
  facts: number
  categories: { id: string; label: string }[]
  high_risk: string[]
  has_site: boolean
  demo_attacks: string[]
  /** Example questions per language plus `inject`; empty for the airline (built into the UI). */
  examples: Partial<Record<Language, { text: string; hint: string }[]>> & { inject?: string }
}

export interface DomainList {
  active: string
  domains: DomainInfo[]
}

export interface Fact {
  id: string
  category: FactCategory
  subject: string
  attribute: string
  value: string
  unit: string | null
  statement: string
  updated_at: string
  last_changed_at: string | null
  recently_changed: boolean
}

export interface DriftEvent {
  id: number
  ts: string
  fact_id: string
  old_value: string | null
  new_value: string
  source: 'edit' | 'review'
  subject: string | null
  attribute: string | null
  category: FactCategory | null
  unit: string | null
}

export interface FactUpdateResult {
  fact: Omit<Fact, 'last_changed_at' | 'recently_changed'>
  drift_event: DriftEvent | null
  reembedded: boolean
}

// ------------------------------------------------------------------ manual audit (audit.py)

export interface AuditFinding {
  manual: string
  section: string
  quote: string
  span: [number, number]
  fact_id: string
  verified_value: string
  verified_unit: string | null
  verified_statement: string
  issue: string
  proposed_paragraph: string
  numeric_check: 'mismatch' | 'n/a'
  model?: string
}

export interface AuditRun {
  id: number
  ts: string
  findings: AuditFinding[]
}

export type AuditEvent =
  | { type: 'progress'; manual: string; done: number; total: number }
  | { type: 'finding'; finding: AuditFinding }
  | { type: 'error'; manual: string; message: string }
  | { type: 'result'; audit_id: number; ts: string; count: number; manuals: number; sections: number; ms: number; findings: AuditFinding[] }

// ------------------------------------------------------------------ red team (redteam.py)

export type AttackType =
  | 'fake_fee' | 'wrong_deadline' | 'invented_policy' | 'prompt_injection' | 'emotional_pressure'
  | 'off_topic' | 'competitor_comparison'

export interface Attack {
  id: string
  type: AttackType
  title: string
  prompt: string
  language: Language
  expected: 'correct' | 'refuse' | 'block'
  target_fact_ids: string[]
  notes: string
}

export type RedTeamOutcome = 'blocked' | 'corrected' | 'resisted' | 'escaped'

export interface OutcomeCounts {
  blocked: number
  corrected: number
  resisted: number
  escaped: number
  total: number
}

export interface Scoreboard {
  by_type: Record<string, OutcomeCounts>
  totals: OutcomeCounts
  caught: number
  flagged: number
}

export interface AttackResult {
  id: string
  type: AttackType
  title: string
  expected: Attack['expected']
  outcome: RedTeamOutcome
  status: Status
  retries: number
  trust_score: number
  flags: string[]
  final_answer: string
  interaction_id: number | null
  ms: number
  error: { kind: string; message: string; provider: string } | null
  scoreboard: Scoreboard
}

export type RedTeamEvent =
  | { type: 'start'; total: number; attack_ids: string[] }
  | { type: 'attack_start'; id: string; attackType: AttackType; title: string; index: number; total: number }
  | { type: 'attack_result'; result: AttackResult }
  | { type: 'done'; scoreboard: Scoreboard; ms: number }

// ------------------------------------------------------------------ evaluation (evaluation.py)

export type EvalMode = 'baseline' | 'guarded' | 'injected'
export type EvalQuestionType = 'answerable' | 'stale_trap' | 'adversarial' | 'out_of_scope'

export interface EvalRecord {
  id: string
  type: EvalQuestionType
  category: string
  mode: EvalMode
  question: string
  gold_fact_ids?: string[]
  skipped?: boolean
  /** Answered, but the grader had no quota yet; a rerun grades it. */
  ungraded?: boolean
  error?: string | { kind: string; message: string } | null
  answer?: string
  status?: Status | 'unguarded'
  retries?: number
  trust_score?: number
  interaction_id?: number | null
  first_draft_blocked?: boolean
  first_draft_hallucinated?: boolean
  injected_detail?: string | null
  ms?: number
  cached?: boolean
  hallucinated?: boolean
  graded_claims?: { verdict: Verdict; category: string; text_en: string; evidence_fact_ids: string[]; caught_by: string | null }[]
  models?: string[]
}

export interface EvalModeMetrics {
  n: number
  hallucinations: number
  hallucination_rate_pct: number | null
  latency_ms: { p50: number | null; p95: number | null; n?: number }
  blocked_rate_pct?: number | null
  escalation_rate_pct?: number | null
  correction_success_pct?: number | null
  false_block_rate_pct?: number | null
  catch_rate_pct?: number | null
  maker_skipped_injection?: number
}

export type RateByMode = Partial<Record<EvalMode, { n: number; hallucination_rate_pct: number | null }>>

export interface EvalMetrics {
  modes: Partial<Record<EvalMode, EvalModeMetrics>>
  comparison: {
    paired_n?: number
    baseline_hallucination_rate_pct?: number | null
    guarded_hallucination_rate_pct?: number | null
    reduction_pts?: number | null
    latency_cost_p50_ms?: number | null
  }
  per_category: Record<string, RateByMode>
  per_type: Record<string, RateByMode>
  questions: number
  models_used: Record<string, number>
  skipped: number
  skipped_by_mode?: Partial<Record<EvalMode, number>>
  gemini_only?: boolean
  question_set?: number
  provider?: 'gemini' | 'ollama'
  model?: string
  grader?: string
  ungraded?: number
}

export interface EvalRun {
  id: number
  ts: string
  mode: string
  metrics: EvalMetrics
  per_question: EvalRecord[]
}

export interface EvalLatest {
  current: { running: boolean; mode: string; done: number; total: number; started_at: string; error: string | null } | null
  /** The newest Gemini run. A local-model run never replaces it; see model_comparison. */
  latest: EvalRun | null
  model_comparison: ModelComparison | null
  local_progress: LocalEvalProgress | null
}

export interface ModelSide {
  run_id: number
  ts: string
  model?: string | null
  /** Computed only over the answers graded in both runs. */
  metrics: Pick<EvalMetrics, 'modes' | 'comparison'>
}

/** Gemini vs the local model (FEATURES #26), both graded by Gemini. */
export interface ModelComparison {
  paired_answers: number
  paired_questions: number
  questions: number
  answers: number
  waiting_for_grade: number
  failed: number
  grader: string
  gemini: ModelSide
  ollama: ModelSide
}

/** Progress of a command-line local-model run, read from its checkpoint file. */
export interface LocalEvalProgress {
  state: 'running' | 'stopped' | 'finished'
  done: number
  total: number | null
  started_at: string | null
  updated_at: string
}

// ------------------------------------------------------------------ review queue (routers/review.py)

export interface NewFactBody {
  id?: string
  category: FactCategory
  subject: string
  attribute: string
  value: string
  unit?: string | null
  statement: string
}

export interface ReviewResolution {
  action: 'approve' | 'edit'
  text?: string
  save_as_fact?: NewFactBody
}

export interface ReviewResolved {
  id: number
  review_status: 'resolved'
  reviewer_text: string
  fact: FactUpdateResult | null
  pending: number
}

// ------------------------------------------------------------------ audit report (routers/interactions.py)

export interface ReportEvidence {
  fact_id: string
  statement_at_answer_time: string
  current_value: string | null
  current_statement: string | null
  /** The fact was edited after this answer: the audit trail shows the drift. */
  changed_since: boolean
}

export interface ReportClaim {
  text: string
  text_en: string
  category: string
  verdict: Verdict
  correction: string | null
  caught_by: 'judge' | 'rules' | null
  rule_note: string | null
  manual_section: string | null
  span_start: number | null
  span_end: number | null
  evidence: ReportEvidence[]
}

export interface AuditReport {
  interaction: InteractionSummary
  question: string
  final_answer: string
  drafts: { retry: number; text: string; injected_detail: string | null; claims: ReportClaim[] }[]
  decision: { status: Status; retries: number; strictness: Strictness | null; input_flags: string[]; explanation: string | null }
  trust: { score: number; breakdown: TrustBreakdown }
  timings: { total_ms: number | null; nodes: Record<string, number> | null; spans: TimingSpan[] | null }
  review: { status: 'none' | 'pending' | 'resolved'; reviewer_text: string | null }
  pii_redacted: boolean
}
