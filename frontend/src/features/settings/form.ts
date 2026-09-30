import type { Settings, Strictness } from '@/lib/types'

/** Mirrors backend/app/db.py DEFAULT_SETTINGS. */
export const DEFAULTS: Settings = {
  strictness: 'balanced',
  max_retries: 2,
  high_risk_categories: ['baggage', 'fees', 'refunds'],
  alert_threshold_pct: 30,
  alert_window_min: 10,
}

/** Same rule as backend/app/policy.py is_blocking(). */
export const STRICTNESS: Record<Strictness, { label: string; blocks: string; detail: string }> = {
  strict: {
    label: 'Strict',
    blocks: 'Blocks contradicted and unsupported claims.',
    detail: 'Every claim must be backed by a verified fact. Safest, with more rewrites.',
  },
  balanced: {
    label: 'Balanced',
    blocks: 'Blocks contradicted claims, and unsupported claims in high-risk categories.',
    detail: 'A missing fact about fees or refunds is blocked; a harmless extra detail elsewhere is allowed.',
  },
  lenient: {
    label: 'Lenient',
    blocks: 'Blocks contradicted claims only.',
    detail: 'Answers go out unless a claim is proven wrong. Fewest rewrites, most risk.',
  },
}

export const STRICTNESS_ORDER: Strictness[] = ['strict', 'balanced', 'lenient']

const sameList = (a: string[], b: string[]) => [...a].sort().join() === [...b].sort().join()

/** The fields that differ from what is saved: exactly what PUT /settings needs. */
export function settingsDiff(saved: Settings, form: Settings): Partial<Settings> {
  const diff: Partial<Settings> = {}
  if (form.strictness !== saved.strictness) diff.strictness = form.strictness
  if (form.max_retries !== saved.max_retries) diff.max_retries = form.max_retries
  if (!sameList(form.high_risk_categories, saved.high_risk_categories)) {
    diff.high_risk_categories = [...form.high_risk_categories].sort()
  }
  if (form.alert_threshold_pct !== saved.alert_threshold_pct) diff.alert_threshold_pct = form.alert_threshold_pct
  if (form.alert_window_min !== saved.alert_window_min) diff.alert_window_min = form.alert_window_min
  return diff
}

export interface FieldErrors {
  alert_threshold_pct?: string
  alert_window_min?: string
}

/** Same bounds as backend/app/routers/settings.py SettingsUpdate. */
export function validate(form: Settings): FieldErrors {
  const e: FieldErrors = {}
  const t = form.alert_threshold_pct
  if (!Number.isFinite(t) || t < 1 || t > 100) e.alert_threshold_pct = 'Use a number from 1 to 100.'
  const w = form.alert_window_min
  if (!Number.isInteger(w) || w < 1 || w > 1440) e.alert_window_min = 'Use whole minutes from 1 to 1440 (24 hours).'
  return e
}

/** Same rule as backend/app/analytics.py compute_alert(). */
export function wouldAlert(ratePct: number | null, total: number, thresholdPct: number, minRequests = 3): boolean {
  return total >= minRequests && ratePct !== null && ratePct > thresholdPct
}

// ---------------------------------------------------------------- alert banner dismissal

const DISMISS_KEY = 'veritrust-alert-dismissed'

/** The banner stays hidden for the rest of this alert episode; a new episode shows it again. */
export function nextDismissed(active: boolean, dismissed: boolean): boolean {
  return active ? dismissed : false
}

export function readDismissed(): boolean {
  try {
    return sessionStorage.getItem(DISMISS_KEY) === '1'
  } catch {
    return false
  }
}

export function writeDismissed(v: boolean): void {
  try {
    if (v) sessionStorage.setItem(DISMISS_KEY, '1')
    else sessionStorage.removeItem(DISMISS_KEY)
  } catch {
    // storage blocked: the dismissal just lasts until reload
  }
}
