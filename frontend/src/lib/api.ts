import type { Alerts, Health, ReviewQueue, Settings } from '@/lib/types'

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

export const api = {
  health: () => request<Health>('/health'),
  settings: () => request<Settings>('/settings'),
  alerts: () => request<Alerts>('/alerts'),
  review: () => request<ReviewQueue>('/review'),
}
