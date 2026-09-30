/// <reference types="node" />
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

import { loadedUrls } from './pwa'

/** Load public/sw.js with a stand-in for the worker global and return its routing function. */
function workerRoutes(): (url: string, mode: string, method: string) => string {
  const scope: { location: { origin: string }; addEventListener: () => void; routeFor?: (url: string, mode: string, method: string) => string } = {
    location: { origin: 'http://192.168.1.23:4173' }, addEventListener: () => undefined,
  }
  new Function('self', readFileSync('public/sw.js', 'utf8'))(scope)
  return scope.routeFor!
}

describe('service worker routing', () => {
  const route = workerRoutes()
  const at = (path: string) => `http://192.168.1.23:4173${path}`

  it('never touches the API, so answers always come live from the guardrail', () => {
    expect(route(at('/api/chat/stream'), 'cors', 'POST')).toBe('network')
    expect(route(at('/api/health'), 'cors', 'GET')).toBe('network')
    expect(route(at('/api/export/interactions.csv'), 'navigate', 'GET')).toBe('network')
    expect(route(at('/sw.js'), 'same-origin', 'GET')).toBe('network')
  })

  it('serves page loads from the shell and built files from the cache', () => {
    expect(route(at('/site'), 'navigate', 'GET')).toBe('shell')
    expect(route(at('/assets/Site-abc123.js'), 'cors', 'GET')).toBe('hashed')
    expect(route(at('/icons/site-192.png'), 'no-cors', 'GET')).toBe('static')
    expect(route(at('/site.webmanifest'), 'cors', 'GET')).toBe('static')
    expect(route('https://fonts.gstatic.com/s/barlow/v12/x.woff2', 'cors', 'GET')).toBe('fonts')
    expect(route('https://example.com/tracker.js', 'no-cors', 'GET')).toBe('network')
  })
})

describe('loadedUrls', () => {
  it('lists each loaded resource once, http(s) only', () => {
    expect(loadedUrls([{ name: 'http://h/assets/a.js' }, { name: 'http://h/assets/a.js' }, { name: 'data:image/png;base64,xx' }], ['https://fonts.googleapis.com/css2?family=Barlow']))
      .toEqual(['http://h/assets/a.js', 'https://fonts.googleapis.com/css2?family=Barlow'])
  })
})
