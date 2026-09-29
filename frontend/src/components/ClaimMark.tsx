import { useState, type ReactNode } from 'react'

import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import type { Verdict } from '@/lib/types'
import { VERDICTS } from '@/lib/verdicts'
import { cn } from '@/lib/utils'

interface ClaimMarkProps {
  verdict: Verdict
  children: ReactNode
  /** Popover body: evidence, fact ID, who caught it. */
  detail?: ReactNode
}

/**
 * A claim inside answer text. The underline style differs by verdict (solid / dashed / wavy),
 * not only its colour. The popover opens on hover and on keyboard focus.
 */
export function ClaimMark({ verdict, children, detail }: ClaimMarkProps) {
  const [open, setOpen] = useState(false)
  const v = VERDICTS[verdict]
  const Icon = v.icon
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <span
          role="button"
          tabIndex={0}
          aria-label={`${v.label} claim`}
          onMouseEnter={() => setOpen(true)}
          onMouseLeave={() => setOpen(false)}
          onFocus={() => setOpen(true)}
          onBlur={() => setOpen(false)}
          className={cn('cursor-help rounded-sm underline decoration-2 underline-offset-4', v.mark)}
        >
          {children}
        </span>
      </PopoverTrigger>
      <PopoverContent
        className="w-80 rounded-xl"
        onOpenAutoFocus={(e) => e.preventDefault()}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
      >
        <p className={cn('flex items-center gap-2 font-semibold', v.text)}>
          <Icon className="size-4" aria-hidden />
          {v.label}
        </p>
        {detail && <div className="mt-2 text-sm text-muted-foreground">{detail}</div>}
      </PopoverContent>
    </Popover>
  )
}
