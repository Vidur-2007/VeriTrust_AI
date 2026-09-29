import { Highlight, HighlightItem } from '@/components/animate-ui/primitives/effects/highlight'
import { cn } from '@/lib/utils'

interface Option<T extends string> {
  value: T
  label: string
}

interface SegmentedControlProps<T extends string> {
  label: string
  value: T
  onChange: (value: T) => void
  options: Option<T>[]
  className?: string
}

/**
 * A single-choice control whose active indicator slides between options (Animate UI
 * Highlight, restyled: --surface panel with a --line border on a --surface-2 track).
 */
export function SegmentedControl<T extends string>({
  label, value, onChange, options, className,
}: SegmentedControlProps<T>) {
  return (
    <div role="radiogroup" aria-label={label} className={cn('inline-flex h-10 rounded-lg bg-surface-2 p-1', className)}>
      <Highlight
        controlledItems
        value={value}
        click={false}
        className="inset-0 rounded-md border border-line bg-surface"
        transition={{ type: 'spring', stiffness: 400, damping: 35 }}
      >
        {options.map((o) => (
          <HighlightItem key={o.value} value={o.value}>
            <button
              type="button"
              role="radio"
              aria-checked={value === o.value}
              onClick={() => onChange(o.value)}
              className={cn(
                'h-8 rounded-md px-3 text-sm font-medium transition-colors duration-200',
                value === o.value ? 'text-foreground' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {o.label}
            </button>
          </HighlightItem>
        ))}
      </Highlight>
    </div>
  )
}
