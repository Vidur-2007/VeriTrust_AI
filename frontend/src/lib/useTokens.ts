import { useMemo } from 'react'

import { useAppState } from '@/app/AppState'
import { cssVar } from '@/lib/contrast'

/**
 * Current values of CSS tokens, for libraries that need real colours (Recharts, SVG patterns).
 * Re-reads when the theme changes: data-theme is set before the re-render, so reads are current.
 */
export function useTokenValues(names: string[]): Record<string, string> {
  const { theme } = useAppState()
  const key = names.join()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => Object.fromEntries(names.map((n) => [n, cssVar(n)])), [theme, key])
}
