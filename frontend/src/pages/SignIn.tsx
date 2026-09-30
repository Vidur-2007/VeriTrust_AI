import { Loader, LogIn, TriangleAlert } from 'lucide-react'
import { Link } from 'react-router'

import { useAuth } from '@/app/Auth'
import { Button } from '@/components/ui/button'

/** The sign-in page for the ops console. The customer site stays public. */
export function SignIn() {
  const { signIn, busy, error } = useAuth()
  return (
    <main className="grid min-h-svh place-items-center bg-bg p-6 text-foreground">
      <div className="w-full max-w-md space-y-6 rounded-xl border border-line bg-surface p-8">
        <div className="flex items-center gap-3">
          <img src="/favicon.svg" alt="" className="size-10 shrink-0" />
          <div className="leading-tight">
            <p className="font-heading text-2xl font-semibold">VeriTrust AI</p>
            <p className="text-sm text-muted-foreground">Operations console</p>
          </div>
        </div>

        <div className="space-y-2">
          <h1 className="text-lg font-semibold">Sign in to open the console</h1>
          <p className="text-muted-foreground">
            The console shows every answer, draft and blocked claim, so it is for the support team only.
          </p>
        </div>

        {error && (
          <p role="alert" className="flex items-start gap-2.5 rounded-lg border border-stop/50 bg-stop/10 px-3 py-2.5">
            <TriangleAlert className="mt-0.5 size-4 shrink-0 text-stop" aria-hidden />
            {error}
          </p>
        )}

        <Button size="lg" className="h-11 w-full" onClick={signIn} disabled={busy}>
          {busy ? <Loader className="animate-spin" aria-hidden /> : <LogIn aria-hidden />}
          {busy ? 'Waiting for Google…' : 'Sign in with Google'}
        </Button>

        <p className="border-t border-line pt-4 text-sm text-muted-foreground">
          A customer?{' '}
          <Link to="/site" className="text-beacon underline-offset-4 hover:underline">Go to the Charminar Airways site</Link>
        </p>
      </div>
    </main>
  )
}
