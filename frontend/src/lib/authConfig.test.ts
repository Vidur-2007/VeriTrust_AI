import { describe, expect, it } from 'vitest'

import { allowedEmails, emailAllowed, firebaseConfig, initials, isTrue, resolveAuthMode, signInErrorMessage } from './authConfig'

const FIREBASE = {
  VITE_FIREBASE_API_KEY: 'key', VITE_FIREBASE_AUTH_DOMAIN: 'demo.firebaseapp.com',
  VITE_FIREBASE_PROJECT_ID: 'demo', VITE_FIREBASE_APP_ID: '1:2:web:3',
}

describe('resolveAuthMode', () => {
  it('stays open when nothing is set up', () => {
    expect(resolveAuthMode({})).toBe('open')
    expect(resolveAuthMode({ DEMO_BYPASS_AUTH: 'false', VITE_FIREBASE_API_KEY: '' })).toBe('open')
  })

  it('needs the whole Firebase config before it asks for sign-in', () => {
    expect(resolveAuthMode(FIREBASE)).toBe('firebase')
    expect(resolveAuthMode({ ...FIREBASE, VITE_FIREBASE_APP_ID: ' ' })).toBe('open')
    expect(firebaseConfig(FIREBASE)).toEqual({ apiKey: 'key', authDomain: 'demo.firebaseapp.com', projectId: 'demo', appId: '1:2:web:3' })
  })

  it('lets the demo bypass win over a configured Firebase project', () => {
    for (const v of ['true', 'TRUE', '1', ' yes ']) expect(resolveAuthMode({ ...FIREBASE, DEMO_BYPASS_AUTH: v })).toBe('bypass')
    for (const v of ['false', '0', '', undefined]) expect(resolveAuthMode({ ...FIREBASE, DEMO_BYPASS_AUTH: v })).toBe('firebase')
    expect(isTrue(true)).toBe(true)
  })
})

describe('allowed accounts', () => {
  it('lets anyone in when the list is empty, otherwise only listed emails', () => {
    expect(allowedEmails({})).toEqual([])
    const allowed = allowedEmails({ VITE_AUTH_ALLOWED_EMAILS: ' Ops@Example.com, lead@example.com ,' })
    expect(allowed).toEqual(['ops@example.com', 'lead@example.com'])
    expect(emailAllowed('anyone@gmail.com', [])).toBe(true)
    expect(emailAllowed('OPS@example.com', allowed)).toBe(true)
    expect(emailAllowed('other@example.com', allowed)).toBe(false)
    expect(emailAllowed(null, allowed)).toBe(false)
  })
})

describe('avatar and messages', () => {
  it('builds initials from the name, else the email', () => {
    expect(initials('Vidur Bandaru')).toBe('VB')
    expect(initials('asha')).toBe('A')
    expect(initials('A B C')).toBe('AC')
    expect(initials(null, 'ops@example.com')).toBe('O')
    expect(initials('', null)).toBe('?')
  })

  it('points to the bypass flag when the network is the problem', () => {
    expect(signInErrorMessage('auth/network-request-failed')).toContain('DEMO_BYPASS_AUTH=true')
    expect(signInErrorMessage('auth/popup-blocked')).toContain('pop-ups')
    expect(signInErrorMessage('auth/something-new')).toContain('auth/something-new')
  })
})
