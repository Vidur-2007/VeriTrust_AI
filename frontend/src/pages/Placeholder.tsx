import { Link } from 'react-router'

import type { PageDef } from '@/app/routes'
import { EmptyState } from '@/components/States'
import { Button } from '@/components/ui/button'

/** Stand-in for a page that a later phase builds, so every route already works. */
export function Placeholder({ page }: { page: PageDef }) {
  return (
    <EmptyState
      icon={page.icon}
      title={page.purpose}
      description={`This page is built in ${page.phase}. The route, navigation and shortcuts already work.`}
      action={
        <Button asChild variant="outline">
          <Link to="/styleguide">See the styleguide</Link>
        </Button>
      }
    />
  )
}
