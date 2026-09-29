import { CircleCheck, CircleHelp, CircleX, type LucideIcon } from 'lucide-react'

import type { Verdict } from '@/lib/types'

/** How each Judge verdict looks: never colour alone (underline style + icon + label). */
export const VERDICTS: Record<Verdict, { label: string; icon: LucideIcon; mark: string; text: string }> = {
  supported: {
    label: 'Supported', icon: CircleCheck, text: 'text-ok',
    mark: 'decoration-ok decoration-solid',
  },
  unsupported: {
    label: 'Unsupported', icon: CircleHelp, text: 'text-caution',
    mark: 'decoration-caution decoration-dashed',
  },
  contradicted: {
    label: 'Contradicted', icon: CircleX, text: 'text-stop',
    mark: 'decoration-stop decoration-wavy',
  },
}
