import { useCallback, useEffect, useState, useSyncExternalStore } from 'react'

const BRAND_INK = '#211a52'

/** Chrome's install prompt event (not in the DOM typings). */
interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

function addToHead<K extends 'link' | 'meta'>(tag: K, attrs: Record<string, string>): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag)
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v)
  document.head.appendChild(el)
  return el
}

/** URLs the page has already loaded, for the service worker to cache (see public/sw.js). */
export function loadedUrls(entries: { name: string }[], fonts: string[] = []): string[] {
  return [...new Set([...entries.map((e) => e.name), ...fonts])].filter((u) => /^https?:/.test(u))
}

async function registerWorker(): Promise<void> {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return  // dev: it would fight hot reload
  try {
    await navigator.serviceWorker.register('/sw.js', { scope: '/' })
    const ready = await navigator.serviceWorker.ready
    const fonts = [...document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"][href^="http"]')].map((l) => l.href)
    ready.active?.postMessage({ type: 'cache-loaded', urls: loadedUrls(performance.getEntriesByType('resource'), fonts) })
  } catch {
    // Not a secure origin (plain http on a LAN address) or blocked: the site still works online.
  }
}

/**
 * Makes the customer site an installable app while it is on screen: links the manifest, sets the
 * theme colour, registers the service worker, and offers Chrome's install prompt. The ops console
 * never gets a manifest, so only /site can be installed.
 */
export function useSitePwa(): { canInstall: boolean; install: () => void } {
  const [prompt, setPrompt] = useState<InstallPromptEvent | null>(null)

  useEffect(() => {
    const added = [
      addToHead('link', { rel: 'manifest', href: '/site.webmanifest' }),
      addToHead('meta', { name: 'theme-color', content: BRAND_INK }),
      addToHead('link', { rel: 'apple-touch-icon', href: '/icons/apple-touch-icon.png' }),
      addToHead('meta', { name: 'mobile-web-app-capable', content: 'yes' }),
    ]
    void registerWorker()

    const onPrompt = (e: Event) => {
      e.preventDefault()  // keep it for our own button instead of Chrome's mini-infobar
      setPrompt(e as InstallPromptEvent)
    }
    const onInstalled = () => setPrompt(null)
    window.addEventListener('beforeinstallprompt', onPrompt)
    window.addEventListener('appinstalled', onInstalled)
    return () => {
      added.forEach((el) => el.remove())
      window.removeEventListener('beforeinstallprompt', onPrompt)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  const install = useCallback(() => {
    if (!prompt) return
    void prompt.prompt().then(() => prompt.userChoice).finally(() => setPrompt(null))
  }, [prompt])

  return { canInstall: !!prompt, install }
}

function subscribeOnline(onChange: () => void): () => void {
  window.addEventListener('online', onChange)
  window.addEventListener('offline', onChange)
  return () => {
    window.removeEventListener('online', onChange)
    window.removeEventListener('offline', onChange)
  }
}

/** False while the device has no connection (the installed app still opens from the cache). */
export function useOnline(): boolean {
  return useSyncExternalStore(subscribeOnline, () => navigator.onLine, () => true)
}
