/** Sign-in for the ops pages (FEATURES #23). Read from the repo-root .env (see vite.config.ts). */

export type AuthMode =
  | 'bypass'    // DEMO_BYPASS_AUTH=true: no login at all, nothing loaded from Firebase
  | 'firebase'  // Firebase config present: the ops pages need Google sign-in
  | 'open'      // neither: the ops pages stay open and the top bar says sign-in isn't set up

export interface FirebaseConfig {
  apiKey: string
  authDomain: string
  projectId: string
  appId: string
}

type Env = Record<string, string | boolean | undefined>

const text = (v: string | boolean | undefined) => (typeof v === 'string' ? v.trim() : '')

export function isTrue(v: string | boolean | undefined): boolean {
  return v === true || ['true', '1', 'yes', 'on'].includes(text(v).toLowerCase())
}

/** The Firebase web config, or null unless all four values are set. */
export function firebaseConfig(env: Env): FirebaseConfig | null {
  const config = {
    apiKey: text(env.VITE_FIREBASE_API_KEY), authDomain: text(env.VITE_FIREBASE_AUTH_DOMAIN),
    projectId: text(env.VITE_FIREBASE_PROJECT_ID), appId: text(env.VITE_FIREBASE_APP_ID),
  }
  return Object.values(config).every(Boolean) ? config : null
}

export function resolveAuthMode(env: Env): AuthMode {
  if (isTrue(env.DEMO_BYPASS_AUTH)) return 'bypass'
  return firebaseConfig(env) ? 'firebase' : 'open'
}

/** VITE_AUTH_ALLOWED_EMAILS: comma-separated Google accounts. Empty = any account may sign in. */
export function allowedEmails(env: Env): string[] {
  return text(env.VITE_AUTH_ALLOWED_EMAILS).split(',').map((e) => e.trim().toLowerCase()).filter(Boolean)
}

export function emailAllowed(email: string | null | undefined, allowed: string[]): boolean {
  return allowed.length === 0 || (!!email && allowed.includes(email.trim().toLowerCase()))
}

/** "Vidur Bandaru" -> "VB"; falls back to the email's first letter. */
export function initials(name: string | null | undefined, email?: string | null): string {
  const words = (name ?? '').trim().split(/\s+/).filter(Boolean)
  if (words.length) return (words[0][0] + (words.length > 1 ? words[words.length - 1][0] : '')).toUpperCase()
  return (email?.trim()[0] ?? '?').toUpperCase()
}

/** A Firebase auth error code in words a person at the demo desk can act on. */
export function signInErrorMessage(code: string | undefined): string {
  switch (code) {
    case 'auth/popup-closed-by-user':
    case 'auth/cancelled-popup-request':
      return 'The Google window was closed before sign-in finished. Try again.'
    case 'auth/popup-blocked':
      return 'The browser blocked the Google sign-in window. Allow pop-ups for this site and try again.'
    case 'auth/network-request-failed':
      return "Can't reach Google. Check the connection, or set DEMO_BYPASS_AUTH=true in .env and restart the frontend to skip sign-in."
    case 'auth/unauthorized-domain':
      return "This address isn't authorised in the Firebase project. Add it under Authentication → Settings → Authorised domains."
    case 'auth/operation-not-allowed':
      return 'Google sign-in is not enabled in the Firebase project. Enable it under Authentication → Sign-in method.'
    case 'auth/invalid-api-key':
    case 'auth/api-key-not-valid.-please-pass-a-valid-api-key.':
      return 'The Firebase API key in .env is not valid. Copy the web config from the Firebase console again.'
    default:
      return `Sign-in failed${code ? ` (${code})` : ''}. Try again, or set DEMO_BYPASS_AUTH=true in .env to skip sign-in.`
  }
}
