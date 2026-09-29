import type { LucideIcon } from 'lucide-react'
import { Link } from 'react-router'

import { EmptyState } from '@/components/States'
import { Button } from '@/components/ui/button'

/** Pages outside the ops shell (customer site, printable report) until their phase builds them. */
export function StandalonePlaceholder({ icon, title, description }: {
  icon: LucideIcon
  title: string
  description: string
}) {
  return (
    <main className="mx-auto max-w-3xl p-6 sm:p-12">
      <EmptyState
        icon={icon}
        title={title}
        description={description}
        action={
          <Button asChild variant="outline">
            <Link to="/">Open the ops console</Link>
          </Button>
        }
      />
    </main>
  )
}
