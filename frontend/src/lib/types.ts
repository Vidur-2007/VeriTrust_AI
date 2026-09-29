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
