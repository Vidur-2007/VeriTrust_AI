import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'

import { Skeleton } from '@/components/ui/skeleton'
import { allowedEmails, emailAllowed, firebaseConfig, resolveAuthMode, signInErrorMessage, type AuthMode } from '@/lib/authConfig'
import { SignIn } from '@/pages/SignIn'

export interface AuthUser {
  name: string | null
  email: string | null
  photo: string | null
}

interface AuthState {
  mode: AuthMode
  /** Only meaningful in 'firebase' mode; the other modes are always let in. */
  status: 'loading' | 'signedOut' | 'signedIn'
  user: AuthUser | null
  error: string | null
  busy: boolean
  signIn: () => void
  signOut: () => void
}

const MODE = resolveAuthMode(import.meta.env)
const CONFIG = firebaseConfig(import.meta.env)
const ALLOWED = allowedEmails(import.meta.env)

const Ctx = createContext<AuthState | null>(null)

type Connection = ReturnType<typeof import('@/lib/firebase').connect>

/** Google sign-in for the ops pages (FEATURES #23). The customer site never goes through this. */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthState['status']>(MODE === 'firebase' ? 'loading' : 'signedIn')
  const [user, setUser] = useState<AuthUser | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const connection = useRef<Connection | null>(null)

  useEffect(() => {
    if (MODE !== 'firebase' || !CONFIG) return
    let stop: (() => void) | undefined
    let cancelled = false
    // The SDK is loaded here only, so bypass and open modes never download or run it.
    import('@/lib/firebase').then(({ connect }) => {
      if (cancelled) return
      const c = connect(CONFIG)
      connection.current = c
      stop = c.watch((u) => {
        if (u && !emailAllowed(u.email, ALLOWED)) {
          setError(`${u.email ?? 'This account'} isn't on the list of people who can open the ops console.`)
          void c.signOut()
          return
        }
        setUser(u ? { name: u.displayName, email: u.email, photo: u.photoURL } : null)
        setStatus(u ? 'signedIn' : 'signedOut')
      }, (e) => {
        setError(signInErrorMessage((e as { code?: string }).code))
        setStatus('signedOut')
      })
    }).catch(() => {
      if (cancelled) return
      setError(signInErrorMessage('auth/network-request-failed'))
      setStatus('signedOut')
    })
    return () => {
      cancelled = true
      stop?.()
    }
  }, [])

  const signIn = useCallback(() => {
    const c = connection.current
    if (!c) return
    setBusy(true)
    setError(null)
    c.signIn()
      .catch((e: { code?: string }) => setError(signInErrorMessage(e.code)))
      .finally(() => setBusy(false))
  }, [])

  const signOut = useCallback(() => {
    setError(null)
    void connection.current?.signOut()
  }, [])

  return <Ctx.Provider value={{ mode: MODE, status, user, error, busy, signIn, signOut }}>{children}</Ctx.Provider>
}

export function useAuth(): AuthState {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}

/** Wraps the ops routes: the sign-in page until a Google account is signed in. */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { mode, status } = useAuth()
  if (mode !== 'firebase' || status === 'signedIn') return <>{children}</>
  if (status === 'loading') {
    // Restoring the saved session takes a moment; don't flash the sign-in page meanwhile.
    return <div className="grid min-h-svh place-items-center bg-bg p-6" aria-label="Checking sign-in"><Skeleton className="h-64 w-full max-w-md bg-surface" /></div>
  }
  return <SignIn />
}
