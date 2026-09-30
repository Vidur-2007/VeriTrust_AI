/* Service worker for the Charminar Airways customer site (/site): caches the app shell so the
 * installed app opens instantly and offline. Answers are never cached: /api always goes to the
 * network, so a customer only ever sees a live, verified answer.
 *
 * Registered from the Site page in production builds only (src/features/site/pwa.ts).
 * Bump VERSION to drop every cache.
 */
const VERSION = 'v1'
const SHELL = `charminar-shell-${VERSION}`
const ASSETS = `charminar-assets-${VERSION}`
const FONTS = `charminar-fonts-${VERSION}`
const SHELL_URL = '/index.html'
const PRECACHE = [SHELL_URL, '/site.webmanifest', '/favicon.svg', '/icons/site-192.png', '/icons/site-512.png']
const FONT_HOSTS = ['fonts.googleapis.com', 'fonts.gstatic.com']

/** How a request is served: 'network' (untouched), 'shell', 'hashed', 'static' or 'fonts'. */
function routeFor(url, mode, method) {
  if (method !== 'GET') return 'network'
  const u = new URL(url, self.location.origin)
  if (FONT_HOSTS.includes(u.hostname)) return 'fonts'
  if (u.origin !== self.location.origin) return 'network'
  if (u.pathname.startsWith('/api/') || u.pathname === '/sw.js') return 'network'
  if (mode === 'navigate') return 'shell'
  if (u.pathname.startsWith('/assets/')) return 'hashed'  // content-hashed by the build
  if (/\.(svg|png|ico|webmanifest|woff2?)$/.test(u.pathname)) return 'static'
  return 'network'
}
self.routeFor = routeFor  // for the unit test

async function put(cacheName, request, response) {
  if (response && (response.ok || response.type === 'opaque')) {
    const cache = await caches.open(cacheName)
    await cache.put(request, response.clone())
  }
  return response
}

/** Page loads: the network when there is one (so a new build is picked up), else the cached shell. */
async function shell(request) {
  try {
    return await put(SHELL, SHELL_URL, await fetch(request))
  } catch {
    return (await caches.match(SHELL_URL)) ?? Response.error()
  }
}

// The dev/preview server sends `Vary: Origin`, and a module script's request carries an Origin
// header that the request which filled the cache did not. The URL (content-hashed) is enough.
const ANY_VARY = { ignoreVary: true }

async function cacheFirst(cacheName, request) {
  return (await caches.match(request, ANY_VARY)) ?? put(cacheName, request, await fetch(request))
}

async function staleWhileRevalidate(cacheName, request) {
  const cached = await caches.match(request, ANY_VARY)
  const fresh = fetch(request).then((r) => put(cacheName, request, r)).catch(() => cached ?? Response.error())
  return cached ?? fresh
}

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(SHELL).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting()))
})

self.addEventListener('activate', (event) => {
  const keep = [SHELL, ASSETS, FONTS]
  event.waitUntil(
    caches.keys()
      .then((names) => Promise.all(names.filter((n) => n.startsWith('charminar-') && !keep.includes(n)).map((n) => caches.delete(n))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  const route = routeFor(request.url, request.mode, request.method)
  if (route === 'shell') event.respondWith(shell(request))
  else if (route === 'hashed') event.respondWith(cacheFirst(ASSETS, request))
  else if (route === 'static') event.respondWith(staleWhileRevalidate(ASSETS, request))
  else if (route === 'fonts') event.respondWith(staleWhileRevalidate(FONTS, request))
  // 'network': not handled, the browser fetches it as usual
})

// The page loaded its scripts and fonts before this worker took control. It sends their URLs
// once, so the first visit is enough for the app to open offline.
self.addEventListener('message', (event) => {
  if (event.data?.type !== 'cache-loaded' || !Array.isArray(event.data.urls)) return
  event.waitUntil(Promise.all(event.data.urls.map(async (url) => {
    const route = routeFor(url, 'no-cors', 'GET')
    if (route !== 'hashed' && route !== 'static' && route !== 'fonts') return
    const cacheName = route === 'fonts' ? FONTS : ASSETS
    if (await caches.match(url, ANY_VARY)) return
    const request = new Request(url, route === 'fonts' ? { mode: 'no-cors' } : undefined)
    await put(cacheName, request, await fetch(request)).catch(() => undefined)
  })))
})
