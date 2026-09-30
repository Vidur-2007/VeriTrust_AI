import { EyeOff } from 'lucide-react'

import { REDACTED_LABELS, splitRedacted } from '@/lib/redaction'

/**
 * Stored text with personal data already removed (FEATURES #20): each [PHONE], [EMAIL] or [PNR]
 * token shows as a marker pill (icon + words), and screen readers hear what was removed.
 */
export function RedactedText({ text }: { text: string }) {
  return (
    <>
      {splitRedacted(text).map((p, i) =>
        'text' in p ? (
          <span key={i}>{p.text}</span>
        ) : (
          <span
            key={i}
            title="Removed before the model saw it and before it was logged"
            className="mx-0.5 inline-flex items-center gap-1 rounded-full border border-line bg-surface-2 px-1.5 align-baseline text-sm text-muted-foreground"
          >
            <EyeOff className="size-3.5" aria-hidden />
            <span aria-hidden>{REDACTED_LABELS[p.redacted].short}</span>
            <span className="sr-only">({REDACTED_LABELS[p.redacted].spoken})</span>
          </span>
        ),
      )}
    </>
  )
}
