import { TriangleAlert } from 'lucide-react'
import { Link } from 'react-router'

import { useBackendStatus } from './BackendStatus'

/** Full-width banner under the top bar while the blocked-answer rate is over the threshold. */
export function AlertBanner() {
  const { alerts } = useBackendStatus()
  const a = alerts.data
  if (!a?.active) return null
  return (
    <div role="alert" className="flex items-center gap-3 border-b border-stop/50 bg-stop/10 px-6 py-2.5">
      <TriangleAlert className="size-5 shrink-0 text-stop" aria-hidden />
      <p className="flex-1">{a.message}</p>
      <Link to="/dashboard?filter=blocked" className="font-medium text-beacon underline-offset-4 hover:underline">
        View failing interactions
      </Link>
    </div>
  )
}
