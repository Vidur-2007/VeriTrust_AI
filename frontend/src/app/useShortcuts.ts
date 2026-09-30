import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { toast } from 'sonner'

import { useAppState } from './AppState'
import { createSequence, GO_KEYS, isTyping } from './keys'

/** A dialog, drawer or popover is open: plain keys belong to it, not to the app. */
function overlayOpen(): boolean {
  return !!document.querySelector('[role="dialog"][data-state="open"], [data-radix-popper-content-wrapper]')
}

/**
 * App-wide keys (FEATURES #22): Ctrl/Cmd+K palette, ? shortcut list, I error injection,
 * G then a letter to go to a page. Plain keys never fire while typing or over a dialog.
 * Returns true while a G sequence waits for its second key (for the on-screen hint).
 */
export function useShortcuts(): boolean {
  const { paletteOpen, setPaletteOpen, openPalette, injectEnabled, setInjectEnabled } = useAppState()
  const navigate = useNavigate()
  const sequence = useRef(createSequence(GO_KEYS, 1500))
  const [pending, setPending] = useState(false)

  useEffect(() => {
    let hint: ReturnType<typeof setTimeout> | undefined
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setPaletteOpen(!paletteOpen)
        return
      }
      if (paletteOpen || isTyping(e.target) || overlayOpen() || e.repeat) return

      const step = sequence.current.feed(e)
      if (step === 'pending') {
        setPending(true)
        clearTimeout(hint)
        hint = setTimeout(() => setPending(false), 1500)
        return
      }
      setPending(false)
      if (step) {
        e.preventDefault()
        navigate(step)
        return
      }
      if (e.ctrlKey || e.metaKey || e.altKey) return
      if (e.key === '?') {
        e.preventDefault()
        openPalette('shortcut')
      } else if (e.key.toLowerCase() === 'i') {
        setInjectEnabled(!injectEnabled)
        toast(injectEnabled ? 'Injection off' : 'Injection on', {
          description: injectEnabled
            ? 'Answers are drafted normally.'
            : "The next answer's first draft gets one false detail.",
        })
      }
    }
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      clearTimeout(hint)
    }
  }, [paletteOpen, setPaletteOpen, openPalette, injectEnabled, setInjectEnabled, navigate])

  return pending
}
