import { MapPinOff } from 'lucide-react'
import { Link } from 'react-router'

import { EmptyState } from '@/components/States'
import { Button } from '@/components/ui/button'

export function NotFound() {
  return (
    <EmptyState
      icon={MapPinOff}
      title="There's no page at this address"
      description="Check the link, or go back to the live console."
      action={
        <Button asChild>
          <Link to="/">Open the live console</Link>
        </Button>
      }
    />
  )
}
