import { describe, expect, it } from 'vitest'

import { DEFAULTS, nextDismissed, settingsDiff, validate, wouldAlert } from './form'

describe('settings form', () => {
  it('sends only the fields that changed, ignoring category order', () => {
    expect(settingsDiff(DEFAULTS, { ...DEFAULTS, high_risk_categories: ['refunds', 'baggage', 'fees'] })).toEqual({})
    expect(settingsDiff(DEFAULTS, { ...DEFAULTS, strictness: 'strict', max_retries: 1, high_risk_categories: ['pets', 'fees'] })).toEqual({
      strictness: 'strict', max_retries: 1, high_risk_categories: ['fees', 'pets'],
    })
  })

  it('checks the same bounds as the API', () => {
    expect(validate(DEFAULTS)).toEqual({})
    expect(validate({ ...DEFAULTS, alert_threshold_pct: 0, alert_window_min: 1.5 })).toEqual({
      alert_threshold_pct: 'Use a number from 1 to 100.',
      alert_window_min: 'Use whole minutes from 1 to 1440 (24 hours).',
    })
  })

  it('previews the alert with the backend rule (rate above threshold, at least 3 answers)', () => {
    expect(wouldAlert(66.7, 3, 30)).toBe(true)
    expect(wouldAlert(66.7, 2, 30)).toBe(false)
    expect(wouldAlert(30, 10, 30)).toBe(false)
    expect(wouldAlert(null, 0, 30)).toBe(false)
  })

  it('keeps the banner dismissed only for the current alert episode', () => {
    expect(nextDismissed(true, true)).toBe(true)
    expect(nextDismissed(false, true)).toBe(false)
    expect(nextDismissed(true, false)).toBe(false)
  })
})
