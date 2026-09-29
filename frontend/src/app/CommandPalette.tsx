import { Crosshair, FileSearch, Moon, Plane, Sun, Syringe } from 'lucide-react'
import { useNavigate } from 'react-router'

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
import { MOD_KEY } from '@/lib/platform'
import { useAppState } from './AppState'
import { PAGES } from './routes'

const SHORTCUTS = [
  { keys: `${MOD_KEY} K`, label: 'Open this palette' },
  { keys: 'I', label: 'Turn error injection on or off' },
  { keys: 'Esc', label: 'Close a dialog or popover' },
]

export function CommandPalette() {
  const { paletteOpen, setPaletteOpen, injectEnabled, setInjectEnabled, theme, toggleTheme } =
    useAppState()
  const navigate = useNavigate()

  const run = (action: () => void) => () => {
    setPaletteOpen(false)
    action()
  }

  return (
    <CommandDialog
      open={paletteOpen}
      onOpenChange={setPaletteOpen}
      title="Command palette"
      description="Go to a page or run an action"
    >
      {/* cmdk needs a <Command> root; this shadcn CommandDialog renders children bare. */}
      <Command>
      <CommandInput placeholder="Type a page or an action" />
      <CommandList>
        <CommandEmpty>Nothing matches. Try a page name like "dashboard".</CommandEmpty>
        <CommandGroup heading="Go to">
          {PAGES.map((p) => (
            <CommandItem key={p.path} value={`${p.title} ${p.keywords ?? ''}`} onSelect={run(() => navigate(p.path))}>
              <p.icon aria-hidden />
              {p.title}
            </CommandItem>
          ))}
        </CommandGroup>
        <CommandSeparator />
        <CommandGroup heading="Actions">
          <CommandItem value="toggle injection inject error" onSelect={run(() => setInjectEnabled(!injectEnabled))}>
            <Syringe aria-hidden />
            {injectEnabled ? 'Turn error injection off' : 'Turn error injection on'}
            <CommandShortcut>I</CommandShortcut>
          </CommandItem>
          <CommandItem value="run attacks red team" onSelect={run(() => navigate('/redteam'))}>
            <Crosshair aria-hidden />
            Run attacks in the Red Team Lab
          </CommandItem>
          <CommandItem value="scan manuals audit" onSelect={run(() => navigate('/audit'))}>
            <FileSearch aria-hidden />
            Scan manuals
          </CommandItem>
          <CommandItem value="switch theme dark light" onSelect={run(toggleTheme)}>
            {theme === 'dark' ? <Sun aria-hidden /> : <Moon aria-hidden />}
            Switch to {theme === 'dark' ? 'light' : 'dark'} theme
          </CommandItem>
          <CommandItem value="open customer site" onSelect={run(() => window.open('/site', '_blank'))}>
            <Plane aria-hidden />
            Open the customer site
          </CommandItem>
        </CommandGroup>
        <CommandSeparator />
        <CommandGroup heading="Keyboard shortcuts">
          {SHORTCUTS.map((s) => (
            <CommandItem key={s.keys} value={`shortcut ${s.label}`} disabled>
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
