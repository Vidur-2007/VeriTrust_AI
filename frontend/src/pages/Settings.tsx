import { BellRing, RotateCcw, ShieldAlert, ShieldCheck, ShieldHalf } from 'lucide-react'
import { useCallback, useEffect, useId, useMemo, useState, type KeyboardEvent, type ReactNode } from 'react'
import { Link } from 'react-router'
import { toast } from 'sonner'

import { useBackendStatus } from '@/app/BackendStatus'
import { SegmentedControl } from '@/components/SegmentedControl'
import { ErrorState } from '@/components/States'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { DEFAULTS, settingsDiff, STRICTNESS, STRICTNESS_ORDER, validate, wouldAlert } from '@/features/settings/form'
import { useDomain } from '@/app/Domain'
import { api } from '@/lib/api'
import { categoryLabel } from '@/lib/format'
import type { Settings as SettingsT, Strictness } from '@/lib/types'
import { usePolling } from '@/lib/usePolling'
import { cn } from '@/lib/utils'

const ICONS = { strict: ShieldAlert, balanced: ShieldHalf, lenient: ShieldCheck }
const WINDOWS = ['5', '10', '30', '60']

function Section({ id, title, lead, children }: { id: string; title: string; lead: ReactNode; children: ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="scroll-mt-4 space-y-4 rounded-xl border border-line bg-surface p-5">
      <div>
        <h2 id={`${id}-title`} className="text-lg font-semibold">{title}</h2>
        <p className="mt-1 max-w-3xl text-muted-foreground">{lead}</p>
      </div>
      {children}
    </section>
  )
}

/** Three option cards; arrow keys move between them (a radio group). */
function StrictnessCards({ value, onChange }: { value: Strictness; onChange: (v: Strictness) => void }) {
  const onKey = (e: KeyboardEvent, i: number) => {
    const step = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0
    if (!step) return
    e.preventDefault()
    const next = STRICTNESS_ORDER[(i + step + STRICTNESS_ORDER.length) % STRICTNESS_ORDER.length]
    onChange(next)
    document.getElementById(`strictness-${next}`)?.focus()
  }
  return (
    <div role="radiogroup" aria-label="Strictness" className="grid gap-3 md:grid-cols-3">
      {STRICTNESS_ORDER.map((s, i) => {
        const Icon = ICONS[s]
        const on = value === s
        return (
          <button
            key={s}
            id={`strictness-${s}`}
            type="button"
            role="radio"
            aria-checked={on}
            tabIndex={on ? 0 : -1}
            onClick={() => onChange(s)}
            onKeyDown={(e) => onKey(e, i)}
            className={cn(
              'flex flex-col items-start gap-2 rounded-xl border p-4 text-left transition-colors',
              on ? 'border-beacon bg-beacon/10' : 'border-line bg-bg hover:border-beacon/50',
            )}
          >
            <span className="flex w-full items-center gap-2">
              <Icon className={cn('size-5', on ? 'text-beacon' : 'text-muted-foreground')} aria-hidden />
              <span className="font-heading text-xl font-semibold">{STRICTNESS[s].label}</span>
              {s === 'balanced' && <span className="ml-auto text-sm text-muted-foreground">default</span>}
            </span>
            <span className="font-medium">{STRICTNESS[s].blocks}</span>
            <span className="text-sm text-muted-foreground">{STRICTNESS[s].detail}</span>
          </button>
        )
      })}
    </div>
  )
}

function AlertPreview({ form }: { form: SettingsT }) {
  const window = form.alert_window_min
  const fetchMetrics = useCallback(() => api.metrics(window, 5), [window])
  const m = usePolling(fetchMetrics, 15_000)
  const refresh = m.refresh
  useEffect(() => refresh(), [fetchMetrics, refresh])
  const d = m.data?.window_min === window ? m.data : undefined
  if (!d) return <Skeleton className="h-14 w-full bg-surface-2" />
  const fires = wouldAlert(d.blocked_rate_pct, d.total, form.alert_threshold_pct)
  return (
    <p role="status" className={cn('rounded-lg border px-4 py-3', fires ? 'border-stop/50 bg-stop/10' : 'border-line bg-bg')}>
      <BellRing className={cn('mr-2 inline size-4 align-[-2px]', fires ? 'text-stop' : 'text-muted-foreground')} aria-hidden />
      Right now: <strong>{d.blocked_rate_pct ?? 0}%</strong> of {d.total} answer{d.total === 1 ? '' : 's'} had a draft blocked in the last {window} min.
      {' '}With these settings this <strong className={fires ? 'text-stop' : undefined}>{fires ? 'would alert' : 'would not alert'}</strong>
      {d.total < 3 ? ' (an alert needs at least 3 answers in the window).' : '.'}
    </p>
  )
}

/** Guardrail settings (FEATURES #16) and the alert rule (#17). Changes apply to the next question. */
export function Settings() {
  const { settings, alerts } = useBackendStatus()
  const { domain } = useDomain()
  const saved = settings.data
  const [form, setForm] = useState<SettingsT | null>(null)
  const [saving, setSaving] = useState(false)
  const [serverError, setServerError] = useState<string>()
  // "Custom" shows a minutes field; it stays open while the user types a preset-looking value.
  const [customWindow, setCustomWindow] = useState(false)
  const thresholdId = useId()
  const windowId = useId()

  // Start from the saved settings; keep edits when the background poll refreshes them.
  const current = form ?? saved ?? null
  const diff = useMemo(() => (saved && current ? settingsDiff(saved, current) : {}), [saved, current])
  const changes = Object.keys(diff).length
  const errors = current ? validate(current) : {}
  const set = (patch: Partial<SettingsT>) => setForm({ ...(current as SettingsT), ...patch })

  useEffect(() => {
    if (!changes) return
    const warn = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [changes])

  if (settings.error && !saved) {
    return <ErrorState title="Couldn't load the settings" description={settings.error.message} onRetry={settings.refresh} />
  }
  if (!current || !saved) {
    return (
      <div className="space-y-4" aria-label="Loading settings">
        {Array.from({ length: 3 }, (_, i) => <Skeleton key={i} className="h-44 w-full bg-surface" />)}
      </div>
    )
  }

  const save = async () => {
    if (!changes || Object.keys(errors).length) return
    setSaving(true)
    setServerError(undefined)
    try {
      await api.updateSettings(diff)
      settings.refresh()
      alerts.refresh()
      setForm(null)
      toast.success('Settings saved', { description: 'They apply to the next question.' })
    } catch (e) {
      setServerError((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  const categoriesInUse = current.strictness === 'balanced'
  const windowChoice = customWindow || !WINDOWS.includes(String(current.alert_window_min)) ? 'custom' : String(current.alert_window_min)

  return (
    <form
      className="space-y-4 pb-24"
      onSubmit={(e) => {
        e.preventDefault()
        void save()
      }}
    >
      <Section
        id="strictness"
        title="Strictness"
        lead={<>Which claims stop an answer from reaching the customer. Questions flagged as prompt injection or pressure always run Strict, whatever is set here.</>}
      >
        <StrictnessCards value={current.strictness} onChange={(strictness) => set({ strictness })} />
        <p className="text-sm text-muted-foreground">
          In the Red Team Lab, one attack (ATK-04, a late web check-in) escaped under Balanced with an extra detail no fact
          supports; Strict would have blocked it.
        </p>
      </Section>

      <Section
        id="retries"
        title="Rewrites before a hand-off"
        lead="How many times the Maker may rewrite a blocked draft with the Judge's feedback before the customer gets the safe hand-off and a person reviews it. Each rewrite adds 2 model calls."
      >
        <SegmentedControl
          label="Rewrites"
          value={String(current.max_retries)}
          onChange={(v) => set({ max_retries: Number(v) })}
          options={['0', '1', '2', '3'].map((v) => ({ value: v, label: v === '0' ? '0 (hand off at once)' : v }))}
        />
      </Section>

      <Section
        id="categories"
        title="High-risk categories"
        lead={categoriesInUse
          ? 'Under Balanced, an unsupported claim in these categories is blocked; elsewhere it is allowed.'
          : `Only used under Balanced. With ${STRICTNESS[current.strictness].label} they have no effect, but your choice is kept.`}
      >
        <fieldset className={cn('grid gap-2 sm:grid-cols-2 lg:grid-cols-4', !categoriesInUse && 'opacity-60')}>
          <legend className="sr-only">High-risk categories</legend>
          {domain.categories.map(({ id: c }) => {
            const checked = current.high_risk_categories.includes(c)
            return (
              <label key={c} className="flex cursor-pointer items-center gap-2.5 rounded-lg border border-line bg-bg px-3 py-2.5 hover:border-beacon/50">
                <Checkbox
                  checked={checked}
                  onCheckedChange={(v) => set({
                    high_risk_categories: v === true ? [...current.high_risk_categories, c] : current.high_risk_categories.filter((x) => x !== c),
                  })}
                />
                {categoryLabel(c)}
              </label>
            )
          })}
        </fieldset>
      </Section>

      <Section
        id="alerts"
        title="Alerts"
        lead="Alert the team when too many answers need a blocked draft in a short time: usually a manual has drifted from the verified facts. The banner and a toast link to the failing answers."
      >
        <div className="grid gap-5 lg:grid-cols-2">
          <div className="grid gap-2">
            <label htmlFor={thresholdId} className="font-medium">Alert above</label>
            <div className="flex items-center gap-3">
              <input
                type="range"
                min={1}
                max={100}
                value={Number.isFinite(current.alert_threshold_pct) ? current.alert_threshold_pct : 1}
                onChange={(e) => set({ alert_threshold_pct: Number(e.target.value) })}
                aria-label="Alert threshold, percent"
                className="h-2 flex-1 accent-(--accent)"
              />
              <div className="flex items-center gap-1.5">
                <Input
                  id={thresholdId}
                  type="number"
                  min={1}
                  max={100}
                  value={Number.isFinite(current.alert_threshold_pct) ? current.alert_threshold_pct : ''}
                  onChange={(e) => set({ alert_threshold_pct: e.target.value === '' ? NaN : Number(e.target.value) })}
                  aria-invalid={!!errors.alert_threshold_pct}
                  aria-describedby={`${thresholdId}-hint`}
                  className="h-10 w-20"
                />
                <span>%</span>
              </div>
            </div>
            <p id={`${thresholdId}-hint`} className={cn('text-sm', errors.alert_threshold_pct ? 'text-stop' : 'text-muted-foreground')}>
              {errors.alert_threshold_pct ?? 'of answers with a blocked draft (corrected or handed off).'}
            </p>
          </div>
          <div className="grid gap-2">
            <span id={windowId} className="font-medium">Over the last</span>
            <div className="flex flex-wrap items-center gap-3">
              <SegmentedControl
                label="Alert window"
                value={windowChoice}
                onChange={(v) => {
                  setCustomWindow(v === 'custom')
                  if (v !== 'custom') set({ alert_window_min: Number(v) })
                }}
                options={[...WINDOWS.map((w) => ({ value: w, label: `${w} min` })), { value: 'custom', label: 'Custom' }]}
              />
              {windowChoice === 'custom' && (
                <div className="flex items-center gap-1.5">
                  <Input
                    type="number"
                    min={1}
                    max={1440}
                    value={Number.isFinite(current.alert_window_min) ? current.alert_window_min : ''}
                    onChange={(e) => set({ alert_window_min: e.target.value === '' ? NaN : Number(e.target.value) })}
                    aria-labelledby={windowId}
                    aria-invalid={!!errors.alert_window_min}
                    className="h-10 w-24"
                  />
                  <span>min</span>
                </div>
              )}
            </div>
            {errors.alert_window_min && <p className="text-sm text-stop">{errors.alert_window_min}</p>}
          </div>
        </div>
        {!errors.alert_window_min && <AlertPreview form={current} />}
        {alerts.data?.active && (
          <p className="text-sm">
            An alert is active now ({alerts.data.blocked_rate_pct}% over the saved threshold of {alerts.data.threshold_pct}%).{' '}
            <Link to="/dashboard?filter=blocked" className="text-beacon underline-offset-4 hover:underline">See the failing answers</Link>
          </p>
        )}
      </Section>

      {/* Actions sit on the left: toasts appear bottom-right and would cover a right-hand Save. */}
      <div className="sticky bottom-0 z-10 -mx-6 flex flex-wrap items-center gap-3 border-t border-line bg-bg/95 px-6 py-3 backdrop-blur">
        <Button type="submit" disabled={!changes || saving || Object.keys(errors).length > 0}>
          {saving ? 'Saving…' : 'Save settings'}
        </Button>
        <Button type="button" variant="outline" onClick={() => { setForm(null); setCustomWindow(false); setServerError(undefined) }} disabled={!changes}>
          Discard
        </Button>
        <Button type="button" variant="ghost" onClick={() => { setForm({ ...DEFAULTS }); setCustomWindow(false) }}>
          <RotateCcw /> Restore defaults
        </Button>
        <p className="text-sm" role="status">
          {serverError ? <span className="text-stop">{serverError}</span>
            : changes ? <><strong>{changes}</strong> unsaved change{changes === 1 ? '' : 's'}. They apply to the next question once saved.</>
            : <span className="text-muted-foreground">All changes saved. They apply to the next question.</span>}
        </p>
      </div>
    </form>
  )
}
