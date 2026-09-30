/** Firebase Auth. Imported dynamically, and only when sign-in is set up (see app/Auth.tsx). */
import { initializeApp } from 'firebase/app'
import { getAuth, GoogleAuthProvider, onAuthStateChanged, signInWithPopup, signOut, type User } from 'firebase/auth'

import type { FirebaseConfig } from './authConfig'

export type { User }

export function connect(config: FirebaseConfig) {
  const auth = getAuth(initializeApp(config))
  const google = new GoogleAuthProvider()
  google.setCustomParameters({ prompt: 'select_account' })
  return {
    /** Fires with the restored session on load, then on every sign-in and sign-out. */
    watch: (onUser: (user: User | null) => void, onError: (e: Error) => void) => onAuthStateChanged(auth, onUser, onError),
    signIn: () => signInWithPopup(auth, google),
    signOut: () => signOut(auth),
  }
}
