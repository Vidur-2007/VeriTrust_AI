import {
  Accessibility, Crosshair, Download, FileSearch, FileText, Inbox, MessageSquareText, Moon, PanelRightOpen, Plane, ShieldAlert,
  ShieldCheck, ShieldHalf, Square, Sun, Syringe,
} from 'lucide-react'
import { useNavigate } from 'react-router'
import { toast } from 'sonner'

import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from '@/components/ui/command'
import { useConsoleSession } from '@/features/console/ConsoleSession'
import { EXAMPLES } from '@/features/console/language'
import { exportFileName, exportLink } from '@/features/dashboard/exportLink'
import { useRedTeam } from '@/features/redteam/RedTeamSession'
import { DEMO_SET } from '@/features/redteam/runState'
import { STRICTNESS, STRICTNESS_ORDER } from '@/features/settings/form'
import { api } from '@/lib/api'
import type { Strictness } from '@/lib/types'
import { useAppState } from './AppState'
import { useBackendStatus } from './BackendStatus'
import { goKeyFor, parseInteractionQuery, SHORTCUTS } from './keys'
import { PAGES } from './routes'

const STRICTNESS_ICONS = { strict: ShieldAlert, balanced: ShieldHalf, lenient: ShieldCheck }
const REFUND_QUESTION = 'How long does a refund take if I cancel my flight?'

function download(href: string, name: string) {
  const a = document.createElement('a')
  a.href = href
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
}

/** Ctrl/Cmd+K (FEATURES #22): go anywhere, run the demo, and change the guardrail from the keyboard. */
export function CommandPalette() {
  const {
    paletteOpen, setPaletteOpen, paletteQuery, setPaletteQuery, injectEnabled, setInjectEnabled, theme, toggleTheme,
    reduceMotion, setReduceMotion,
  } = useAppState()
  const { settings, review } = useBackendStatus()
  const { send } = useConsoleSession()
  const { run: redteam, start: startRedTeam, stop: stopRedTeam } = useRedTeam()
  const navigate = useNavigate()
  const interactionId = parseInteractionQuery(paletteQuery)
  const strictness = settings.data?.strictness
  const waiting = review.data?.count ?? 0
  const redteamRunning = redteam.phase === 'running'

  const run = (action: () => void) => () => {
    setPaletteOpen(false)
    setPaletteQuery('')
    action()
  }

  const ask = (question: string, inject?: boolean) => run(() => {
    navigate('/')
    send(question, inject)
  })

  const setStrictness = (s: Strictness) => run(async () => {
    try {
      await api.updateSettings({ strictness: s })
      settings.refresh()
      toast.success(`Strictness set to ${STRICTNESS[s].label}`, { description: 'It applies to the next question.' })
    } catch (e) {
      toast.error((e as Error).message)
    }
  })

  return (
    <CommandDialog
      open={paletteOpen}
      onOpenChange={(open) => {
        setPaletteOpen(open)
        if (!open) setPaletteQuery('')
      }}
      title="Command palette"
      description="Go to a page, ask a demo question or change the guardrail"
    >
      {/* cmdk needs a <Command> root; this shadcn CommandDialog renders children bare. */}
      <Command>
        <CommandInput value={paletteQuery} onValueChange={setPaletteQuery} placeholder="Type a page, an action, or an interaction number like #887" />
        <CommandList>
          {/* cmdk doesn't count force-mounted items, so the interaction group would sit under "Nothing matches". */}
          {interactionId === null && (
            <CommandEmpty>Nothing matches. Try a page name like "dashboard", or an interaction number.</CommandEmpty>
          )}

          {interactionId !== null && (
            <CommandGroup heading={`Interaction #${interactionId}`} forceMount>
              <CommandItem forceMount value={`interaction ${interactionId} dashboard`} onSelect={run(() => navigate(`/dashboard?id=${interactionId}`))}>
                <PanelRightOpen aria-hidden />
                Open interaction #{interactionId} in the dashboard
              </CommandItem>
              <CommandItem forceMount value={`interaction ${interactionId} audit report`} onSelect={run(() => navigate(`/interactions/${interactionId}/report`))}>
                <FileText aria-hidden />
                Audit report #{interactionId}
              </CommandItem>
            </CommandGroup>
          )}

          <CommandGroup heading="Go to">
            {PAGES.map((p) => (
              <CommandItem key={p.path} value={`${p.title} ${p.keywords ?? ''}`} onSelect={run(() => navigate(p.path))}>
                <p.icon aria-hidden />
                {p.title}
                {p.path === '/review' && waiting > 0 && <span className="text-muted-foreground">{waiting} waiting</span>}
                {goKeyFor(p.path) && <CommandShortcut>{goKeyFor(p.path)}</CommandShortcut>}
              </CommandItem>
            ))}
          </CommandGroup>
          <CommandSeparator />

          <CommandGroup heading="Ask a demo question in the console">
            {EXAMPLES.en.map((e) => (
              <CommandItem key={e.text} value={`ask demo ${e.text} ${e.hint}`} onSelect={ask(e.text)}>
                <MessageSquareText aria-hidden />
                <span className="min-w-0 flex-1 truncate">{e.text}</span>
                <span className="text-muted-foreground">{e.hint}</span>
              </CommandItem>
            ))}
            <CommandItem value="ask demo refund with an error injected inject" onSelect={ask(REFUND_QUESTION, true)}>
              <Syringe aria-hidden />
              <span className="min-w-0 flex-1 truncate">Ask the refund question with an error injected</span>
              <span className="text-muted-foreground">Demo step 3</span>
            </CommandItem>
          </CommandGroup>
          <CommandSeparator />

          <CommandGroup heading="Actions">
            <CommandItem value="toggle injection inject error" onSelect={run(() => setInjectEnabled(!injectEnabled))}>
              <Syringe aria-hidden />
              {injectEnabled ? 'Turn error injection off' : 'Turn error injection on'}
              <CommandShortcut>I</CommandShortcut>
            </CommandItem>
            {redteamRunning ? (
              <CommandItem value="stop red team run attacks" onSelect={run(stopRedTeam)}>
                <Square aria-hidden />
                Stop the red-team run
                <span className="text-muted-foreground">{redteam.results.length}/{redteam.total}</span>
              </CommandItem>
            ) : (
              <CommandItem
                value="run red team attacks demo set scoreboard"
                onSelect={run(() => {
                  startRedTeam(DEMO_SET)
                  navigate('/redteam')
                })}
              >
                <Crosshair aria-hidden />
                Run the red-team demo set ({DEMO_SET.length} attacks)
              </CommandItem>
            )}
            {STRICTNESS_ORDER.map((s) => {
              const Icon = STRICTNESS_ICONS[s]
              return (
                <CommandItem key={s} value={`set strictness ${s} guardrail`} disabled={strictness === s} onSelect={setStrictness(s)}>
                  <Icon aria-hidden />
                  Set strictness: {STRICTNESS[s].label}
                  {strictness === s && <span className="text-muted-foreground">current</span>}
                </CommandItem>
              )
            })}
            <CommandItem value="scan manuals audit stale" onSelect={run(() => navigate('/audit?scan=1'))}>
              <FileSearch aria-hidden />
              Scan the manuals for stale sections
            </CommandItem>
            <CommandItem
              value="export download csv interactions last 24 hours"
              onSelect={run(() => {
                const choice = { range: 'day', channel: 'all', status: 'all' } as const
                download(exportLink('csv', choice), exportFileName('csv', choice))
              })}
            >
              <Download aria-hidden />
              Export the last 24 h of interactions (CSV)
            </CommandItem>
            <CommandItem value="open review queue escalations human" onSelect={run(() => navigate('/review'))}>
              <Inbox aria-hidden />
              Open the review queue
              {waiting > 0 && <span className="text-muted-foreground">{waiting} waiting</span>}
            </CommandItem>
            <CommandItem value="switch theme dark light" onSelect={run(toggleTheme)}>
              {theme === 'dark' ? <Sun aria-hidden /> : <Moon aria-hidden />}
              Switch to {theme === 'dark' ? 'light' : 'dark'} theme
            </CommandItem>
            <CommandItem value="reduce motion animation accessibility" onSelect={run(() => setReduceMotion(!reduceMotion))}>
              <Accessibility aria-hidden />
              {reduceMotion ? 'Turn animations back on' : 'Reduce motion'}
            </CommandItem>
            <CommandItem value="open customer site" onSelect={run(() => window.open('/site', '_blank'))}>
              <Plane aria-hidden />
              Open the customer site
            </CommandItem>
          </CommandGroup>
          <CommandSeparator />

          <CommandGroup heading="Keyboard shortcuts">
            {SHORTCUTS.map((s) => (
              <CommandItem key={s.keys} value={`shortcut keyboard ${s.label}`} disabled>
                {s.label}
                <CommandShortcut>{s.keys}</CommandShortcut>
              </CommandItem>
            ))}
          </CommandGroup>
        </CommandList>
      </Command>
    </CommandDialog>
  )
}
