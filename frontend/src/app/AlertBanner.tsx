import { TriangleAlert, X } from 'lucide-react'
import { Link } from 'react-router'

import { useBackendStatus } from './BackendStatus'

/** Full-width banner under the top bar while the blocked-answer rate is over the threshold.
 *  Dismiss hides it for this alert episode; the bell keeps the alert until it clears. */
export function AlertBanner() {
  const { alerts, bannerDismissed, setBannerDismissed } = useBackendStatus()
  const a = alerts.data
  if (!a?.active || bannerDismissed) return null
  return (
    <div role="alert" className="flex items-center gap-3 border-b border-stop/50 bg-stop/10 px-6 py-2.5">
      <TriangleAlert className="size-5 shrink-0 text-stop" aria-hidden />
      <p className="flex-1">
        {a.message}
        <span className="text-muted-foreground"> {a.blocked} of {a.total} answers had a draft blocked.</span>
      </p>
      <Link to="/dashboard?filter=blocked" className="font-medium text-beacon underline-offset-4 hover:underline">
        View failing interactions
      </Link>
      <button
        type="button"
        onClick={() => setBannerDismissed(true)}
        aria-label="Dismiss this alert until it clears"
        className="grid size-8 place-items-center rounded-md text-muted-foreground hover:bg-surface-2 hover:text-foreground"
      >
        <X className="size-4" aria-hidden />
      </button>
    </div>
  )
}
