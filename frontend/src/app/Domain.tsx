import { createContext, Fragment, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import { toast } from 'sonner'

import { api } from '@/lib/api'
import type { DomainInfo } from '@/lib/types'
import { usePolling } from '@/lib/usePolling'
import { AIRLINE } from './domainInfo'

interface DomainState {
  /** The active domain pack (FEATURES #25): whose knowledge base the guardrail is checking. */
  domain: DomainInfo
  domains: DomainInfo[]
  switching: boolean
  switchTo: (id: string) => void
}

const Ctx = createContext<DomainState | null>(null)

export function DomainProvider({ children }: { children: ReactNode }) {
  const list = usePolling(api.domains, 60_000)
  const [switching, setSwitching] = useState(false)

  const domains = useMemo(() => list.data?.domains ?? [AIRLINE], [list.data])
  const domain = domains.find((d) => d.id === list.data?.active) ?? AIRLINE

  const switchTo = useCallback((id: string) => {
    if (id === domain.id) return
    setSwitching(true)
    // Everything on screen (console answer, red-team run, dashboards) belongs to the old pack:
    // reload once the backend has switched so every page starts from the new one.
    api.switchDomain(id).then(() => window.location.reload()).catch((e: Error) => {
      setSwitching(false)
      toast.error("Couldn't switch the knowledge base", { description: e.message, duration: 10_000 })
    })
  }, [domain.id])

  return <Ctx.Provider value={{ domain, domains, switching, switchTo }}>{children}</Ctx.Provider>
}

export function useDomain(): DomainState {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useDomain must be used inside <DomainProvider>')
  return ctx
}

/** Remounts its children when the active pack changes, so per-pack state starts fresh. */
export function PerDomain({ children }: { children: ReactNode }) {
  return <Fragment key={useDomain().domain.id}>{children}</Fragment>
}
