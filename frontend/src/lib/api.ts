import type {
  Alerts, Attack, AuditRun, Channel, DriftEvent, EvalLatest, Fact, FactUpdateResult, Health, Interaction, InteractionPage, Metrics,
  ReviewQueue, ReviewResolution, ReviewResolved, Settings, Status,
} from '@/lib/types'

/** An API failure with a message that is safe to show in the UI. */
export class ApiError extends Error {
  readonly status: number

  constructor(status: number, message: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

function detailMessage(detail: unknown): string | null {
  if (typeof detail === 'string') return detail
  if (Array.isArray(detail) && detail[0]?.msg) return String(detail[0].msg)
  return null
}

export async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response
  try {
    res = await fetch(`/api${path}`, {
      ...init,
      headers: { 'Content-Type': 'application/json', ...init?.headers },
    })
  } catch {
    throw new ApiError(0, "Can't reach the backend. Start it with: uvicorn app.main:app --port 8000")
  }
  if (!res.ok) {
    let message = `The server answered ${res.status}.`
    try {
      message = detailMessage((await res.json()).detail) ?? message
    } catch {
      // not JSON: keep the generic message
    }
    throw new ApiError(res.status, message)
  }
  return (await res.json()) as T
}

function query(params: Record<string, string | number | null | undefined>): string {
  const q = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) if (v !== null && v !== undefined && v !== '') q.set(k, String(v))
  const s = q.toString()
  return s ? `?${s}` : ''
}

export interface InteractionQuery {
  status?: Status | null
  channel?: Channel | null
  review_status?: 'none' | 'pending' | 'resolved' | null
  q?: string | null
  limit?: number
  offset?: number
}

export const api = {
  health: () => request<Health>('/health'),
  settings: () => request<Settings>('/settings'),
  alerts: () => request<Alerts>('/alerts'),
  review: () => request<ReviewQueue>('/review'),
  resolveReview: (id: number, body: ReviewResolution) =>
    request<ReviewResolved>(`/review/${id}`, { method: 'POST', body: JSON.stringify(body) }),
  flagForReview: (id: number) =>
    request<{ id: number; review_status: 'pending'; pending: number }>(`/review/${id}/flag`, { method: 'POST' }),
  metrics: (windowMin: number | null, seriesMin: number) =>
    request<Metrics>(`/metrics${query({ window_min: windowMin, series_min: seriesMin })}`),
  interactions: (p: InteractionQuery = {}) => request<InteractionPage>(`/interactions${query({ ...p })}`),
  interaction: (id: number) => request<Interaction>(`/interactions/${id}`),
  facts: () => request<{ count: number; items: Fact[] }>('/facts'),
  updateFact: (id: string, change: { value?: string; unit?: string; statement?: string }) =>
    request<FactUpdateResult>(`/facts/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(change) }),
  driftEvents: (limit = 100) => request<{ count: number; items: DriftEvent[] }>(`/drift/events${query({ limit })}`),
  latestAudit: () => request<AuditRun | null>('/audit/latest'),
  redteamAttacks: () => request<{ count: number; items: Attack[] }>('/redteam/attacks'),
  evalLatest: () => request<EvalLatest>('/eval/latest'),
}
