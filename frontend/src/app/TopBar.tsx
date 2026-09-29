import { Bell, Cpu, Moon, Search, ShieldCheck, Sun, Unplug } from 'lucide-react'
import { Link, useLocation } from 'react-router'

import { Kbd } from '@/components/Kbd'
import { MOD_KEY } from '@/lib/platform'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Switch } from '@/components/ui/switch'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { useAppState } from './AppState'
import { useBackendStatus } from './BackendStatus'
import { pageFor } from './routes'

const CHIP = 'inline-flex h-8 items-center gap-2 rounded-full border px-3 text-sm'


function StrictnessChip() {
  const { settings } = useBackendStatus()
  const strictness = settings.data?.strictness
  if (!strictness) return null
  const label = strictness[0].toUpperCase() + strictness.slice(1)
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Link to="/settings" className={cn(CHIP, 'border-line bg-surface-2 hover:border-beacon')}>
          <ShieldCheck className="size-4 text-muted-foreground" aria-hidden />
          <span className="text-muted-foreground">Strictness</span>
          <span className="font-medium">{label}</span>
        </Link>
      </TooltipTrigger>
      <TooltipContent>Change it in Settings. It applies to the next question.</TooltipContent>
    </Tooltip>
  )
}

/** Shown only while the backend answers with the local model (FEATURES.md #4), or is down. */
function ProviderChip() {
  const { health } = useBackendStatus()
  if (health.error) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span className={cn(CHIP, 'border-stop/50 bg-stop/10 text-stop')} tabIndex={0}>
            <Unplug className="size-4" aria-hidden />
            Backend offline
          </span>
        </TooltipTrigger>
        <TooltipContent className="max-w-80">{health.error.message}</TooltipContent>
      </Tooltip>
    )
  }
  const p = health.data?.provider
  if (!p?.running_locally) return null
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className={cn(CHIP, 'border-line bg-surface-2')} tabIndex={0}>
          <Cpu className="size-4 text-muted-foreground" aria-hidden />
          <span className="size-2 rounded-full bg-caution" aria-hidden />
          Running locally
        </span>
      </TooltipTrigger>
      <TooltipContent className="max-w-80">
        <p>Answers come from {p.active_model} on this machine.</p>
        {p.fallback_reason && <p className="mt-1 text-muted-foreground">{p.fallback_reason}</p>}
        {p.gemini_retry_in_s > 0 && <p className="mt-1">Trying Gemini again in {p.gemini_retry_in_s} s.</p>}
      </TooltipContent>
    </Tooltip>
  )
}

function InjectToggle() {
  const { injectEnabled, setInjectEnabled } = useAppState()
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <label
          className={cn(
            CHIP,
            'cursor-pointer select-none',
            injectEnabled ? 'border-beacon bg-beacon/10' : 'border-line bg-surface-2',
          )}
        >
          <Switch checked={injectEnabled} onCheckedChange={setInjectEnabled} aria-label="Inject error" />
          Inject error
          <Kbd>I</Kbd>
        </label>
      </TooltipTrigger>
      <TooltipContent className="max-w-80">
        Adds one false detail to the next answer's first draft, so you can watch the Judge catch it.
      </TooltipContent>
    </Tooltip>
  )
}

function AlertsButton() {
  const { alerts } = useBackendStatus()
  const a = alerts.data
  const active = !!a?.active
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon-lg" className="relative" aria-label={active ? 'Alerts: 1 active' : 'Alerts: none'}>
          <Bell className="size-5" />
          {active && <span className="absolute top-1.5 right-1.5 size-2.5 rounded-full bg-stop" aria-hidden />}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-96 rounded-xl">
        {!a ? (
          <p className="text-muted-foreground">Alerts load when the backend is reachable.</p>
        ) : active ? (
          <div className="space-y-3">
            <p className="font-semibold text-stop">{a.message}</p>
            <ul className="space-y-1 text-sm">
              {a.recent_failing.slice(0, 5).map((f) => (
                <li key={f.id} className="truncate text-muted-foreground">
                  #{f.id} {f.status}: {f.question}
                </li>
              ))}
            </ul>
            <Button asChild variant="outline"><Link to="/dashboard">View failing interactions</Link></Button>
          </div>
        ) : (
          <div className="space-y-1">
            <p className="font-semibold">No alerts</p>
            <p className="text-sm text-muted-foreground">
              {a.blocked_rate_pct ?? 0}% of {a.total} answers were blocked in the last {a.window_min} min.
              The alert fires above {a.threshold_pct}% (with at least {a.min_requests} answers).
            </p>
          </div>
        )}
      </PopoverContent>
    </Popover>
  )
}

function ThemeButton() {
  const { theme, toggleTheme } = useAppState()
  const next = theme === 'dark' ? 'light' : 'dark'
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="ghost" size="icon-lg" onClick={toggleTheme} aria-label={`Switch to ${next} theme`}>
          {theme === 'dark' ? <Sun className="size-5" /> : <Moon className="size-5" />}
        </Button>
      </TooltipTrigger>
      <TooltipContent>Switch to {next} theme</TooltipContent>
    </Tooltip>
  )
}

function PaletteButton() {
  const { setPaletteOpen } = useAppState()
  return (
    <Button variant="outline" size="lg" onClick={() => setPaletteOpen(true)} className="gap-2 text-muted-foreground">
      <Search className="size-4" aria-hidden />
      <span className="hidden lg:inline">Search</span>
      <Kbd>{MOD_KEY} K</Kbd>
    </Button>
  )
}

export function TopBar() {
  const { pathname } = useLocation()
  const title = pageFor(pathname)?.title ?? 'Page not found'
  return (
    <header className="flex h-16 shrink-0 items-center gap-4 border-b border-line px-6">
      <h1 className="font-heading text-2xl font-semibold">{title}</h1>
      <div className="ml-auto flex items-center gap-2">
        <StrictnessChip />
        <ProviderChip />
        <InjectToggle />
        <AlertsButton />
        <ThemeButton />
        <PaletteButton />
      </div>
    </header>
  )
}
