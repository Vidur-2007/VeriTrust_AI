import { ExternalLink, Plane } from 'lucide-react'
import { Fragment } from 'react'
import { NavLink, useLocation } from 'react-router'

import { Highlight, HighlightItem } from '@/components/animate-ui/primitives/effects/highlight'
import { NumberTicker } from '@/components/ui/number-ticker'
import { Separator } from '@/components/ui/separator'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { useBackendStatus } from './BackendStatus'
import { GROUP_ORDER, pageFor, PAGES, type PageDef } from './routes'

const ITEM = 'relative flex h-10 items-center gap-3 rounded-lg px-3 transition-colors duration-200'

/** The sliding indicator (Animate UI Highlight): a --surface-2 plate with the 3 px accent bar
 *  riding on its left edge, gliding to the active page. */
const INDICATOR =
  'inset-0 rounded-lg bg-surface-2 before:absolute before:inset-y-2 before:-left-3 before:w-[3px] before:rounded-r-full before:bg-beacon'

/** Rail item: icon + label. Below 1280 px only icons show and the label moves to a tooltip. */
function RailLink({ page, active, badge }: { page: PageDef; active: boolean; badge?: number }) {
  const Icon = page.icon
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <HighlightItem value={page.path}>
          <NavLink
            to={page.path}
            end
            aria-current={active ? 'page' : undefined}
            className={cn(ITEM, active ? 'text-foreground' : 'text-muted-foreground hover:bg-surface-2/50 hover:text-foreground')}
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
                <NumberTicker value={badge} startValue={badge} />
              </span>
            )}
            {!!badge && <span className="sr-only">, {badge} waiting</span>}
          </NavLink>
        </HighlightItem>
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
  const { pathname } = useLocation()
  const pending = review.data?.count ?? 0
  const activePath = pageFor(pathname)?.path ?? null

  return (
    <nav aria-label="Main" className="flex w-16 shrink-0 flex-col border-r border-line bg-bg xl:w-60">
      <div className="flex h-16 items-center gap-2.5 border-b border-line px-4">
        <img src="/favicon.svg" alt="" className="size-8 shrink-0" />
        <div className="hidden leading-tight xl:block">
          <p className="font-heading text-xl font-semibold">VeriTrust AI</p>
          <p className="text-sm text-muted-foreground">Charminar Airways</p>
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-1 overflow-y-auto p-3">
        <Highlight
          controlledItems
          value={activePath}
          click={false}
          className={INDICATOR}
          transition={{ type: 'spring', stiffness: 420, damping: 38 }}
        >
          {GROUP_ORDER.map((group, i) => (
            <Fragment key={group}>
              {i > 0 && <Separator className="my-2 bg-line" />}
              {PAGES.filter((p) => p.group === group).map((p) => (
                <RailLink
                  key={p.path}
                  page={p}
                  active={p.path === activePath}
                  badge={p.path === '/review' ? pending : undefined}
                />
              ))}
            </Fragment>
          ))}
        </Highlight>
      </div>

      <div className="border-t border-line p-3">
        <Tooltip>
          <TooltipTrigger asChild>
            <a href="/site" target="_blank" rel="noreferrer" className={cn(ITEM, 'text-muted-foreground hover:bg-surface-2/50 hover:text-foreground')}>
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
