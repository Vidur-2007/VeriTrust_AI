import { ExternalLink, Plane } from 'lucide-react'
import { Fragment } from 'react'
import { NavLink, useMatch } from 'react-router'

import { Separator } from '@/components/ui/separator'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { useBackendStatus } from './BackendStatus'
import { GROUP_ORDER, PAGES, type PageDef } from './routes'

const ITEM =
  'relative flex h-10 items-center gap-3 rounded-lg px-3 text-muted-foreground hover:bg-surface-2 hover:text-foreground'

/** Rail item: icon + label; the active item gets a 3 px accent bar. Below 1280 px only icons
 *  show, and the label moves into a tooltip. */
function RailLink({ page, badge }: { page: PageDef; badge?: number }) {
  const Icon = page.icon
  // A plain string className: Radix's asChild merge would drop NavLink's function form.
  const isActive = !!useMatch({ path: page.path, end: true })
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <NavLink
          to={page.path}
          end
          className={cn(
            ITEM,
            isActive &&
              'bg-surface-2 text-foreground before:absolute before:inset-y-2 before:-left-3 before:w-[3px] before:rounded-r-full before:bg-beacon',
          )}
        >
          <span className="relative">
            <Icon className="size-5" aria-hidden />
            {!!badge && (
              <span className="absolute -top-1 -right-1 size-2.5 rounded-full bg-stop xl:hidden" aria-hidden />
            )}
          </span>
          <span className="hidden flex-1 truncate xl:inline">{page.title}</span>
          {!!badge && (
            <span className="hidden h-6 min-w-6 items-center justify-center rounded-full border border-stop/50 bg-stop/15 px-1.5 text-sm font-semibold text-stop xl:inline-flex">
              {badge}
            </span>
          )}
          {!!badge && <span className="sr-only">, {badge} waiting</span>}
        </NavLink>
      </TooltipTrigger>
      <TooltipContent side="right" className="xl:hidden">
        {page.title}
        {badge ? ` (${badge} waiting)` : ''}
      </TooltipContent>
    </Tooltip>
  )
}

export function Rail() {
  const { review } = useBackendStatus()
  const pending = review.data?.count ?? 0

  return (
    <nav aria-label="Main" className="flex w-16 shrink-0 flex-col border-r border-line bg-surface xl:w-60">
      <div className="flex h-16 items-center gap-2.5 border-b border-line px-4">
        <img src="/favicon.svg" alt="" className="size-8 shrink-0" />
        <div className="hidden leading-tight xl:block">
          <p className="font-heading text-xl font-semibold">VeriTrust AI</p>
          <p className="text-sm text-muted-foreground">Charminar Airways</p>
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-1 overflow-y-auto p-3">
        {GROUP_ORDER.map((group, i) => (
          <Fragment key={group}>
            {i > 0 && <Separator className="my-2 bg-line" />}
            {PAGES.filter((p) => p.group === group).map((p) => (
              <RailLink key={p.path} page={p} badge={p.path === '/review' ? pending : undefined} />
            ))}
          </Fragment>
        ))}
      </div>

      <div className="border-t border-line p-3">
        <Tooltip>
          <TooltipTrigger asChild>
            <a href="/site" target="_blank" rel="noreferrer" className={ITEM}>
              <Plane className="size-5" aria-hidden />
              <span className="hidden flex-1 xl:inline">Customer site</span>
              <ExternalLink className="hidden size-4 xl:inline" aria-hidden />
              <span className="sr-only">(opens in a new tab)</span>
            </a>
          </TooltipTrigger>
          <TooltipContent side="right" className="xl:hidden">
            Customer site (new tab)
          </TooltipContent>
        </Tooltip>
      </div>
    </nav>
  )
}
