import { Bell, Cpu, Moon, Search, ShieldCheck, Sun, Unplug } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { Link, useLocation } from 'react-router'

import { Kbd } from '@/components/Kbd'
import { MOD_KEY } from '@/lib/platform'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Separator } from '@/components/ui/separator'
import { Switch } from '@/components/ui/switch'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { FAST } from '@/lib/motion'
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
            'transition-[border-color,background-color,box-shadow] duration-200',
            injectEnabled
              ? 'border-beacon bg-beacon/10 shadow-[0_0_0_4px_color-mix(in_srgb,var(--accent)_22%,transparent)]'
              : 'border-line bg-surface-2 hover:border-beacon/60',
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
  const { alerts, bannerDismissed, setBannerDismissed } = useBackendStatus()
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
                <li key={f.id} className="truncate">
                  <Link to={`/dashboard?filter=blocked&id=${f.id}`} className="text-muted-foreground hover:text-foreground">
                    #{f.id} {f.status}: {f.question}
                  </Link>
                </li>
              ))}
            </ul>
            <div className="flex flex-wrap items-center gap-3">
              <Button asChild variant="outline"><Link to="/dashboard?filter=blocked">View failing interactions</Link></Button>
              {bannerDismissed && (
                <button type="button" onClick={() => setBannerDismissed(false)} className="text-sm text-beacon underline-offset-4 hover:underline">
                  Show the banner again
                </button>
              )}
            </div>
            <Link to="/settings#alerts" className="block text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
              Change the alert threshold
            </Link>
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
  const { settings, health } = useBackendStatus()
  const title = pageFor(pathname)?.title ?? 'Page not found'
  // Only draw the divider after the status chips when at least one chip is showing.
  const hasStatus = !!settings.data || !!health.error || !!health.data?.provider.running_locally
  return (
    <header className="flex h-16 shrink-0 items-center gap-4 border-b border-line bg-bg px-6">
      <div className="relative min-w-0 flex-1">
        <AnimatePresence mode="wait" initial={false}>
          <motion.h1
            key={title}
            initial={{ opacity: 0, x: -6 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0 }}
            transition={FAST}
            className="truncate font-heading text-2xl font-semibold"
          >
            {title}
          </motion.h1>
        </AnimatePresence>
      </div>
      <div className="flex items-center gap-2">
        {/* status */}
        <StrictnessChip />
        <ProviderChip />
        {hasStatus && <Separator orientation="vertical" className="mx-1 h-6! bg-line" />}
        {/* mode */}
        <InjectToggle />
        <Separator orientation="vertical" className="mx-1 h-6! bg-line" />
        {/* actions */}
        <AlertsButton />
        <ThemeButton />
        <PaletteButton />
      </div>
    </header>
  )
}
