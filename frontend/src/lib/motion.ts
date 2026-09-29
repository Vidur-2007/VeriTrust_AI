import { useReducedMotionConfig } from 'motion/react'

/**
 * True when motion should be reduced: the OS asks for it, or the viewer switched it on.
 *
 * MotionConfig only stops transform and layout animations. Components that animate anything
 * else (gradients, offset paths, counters, filters) must check this and render a still state.
 */
export function useReduceMotion(): boolean {
  return useReducedMotionConfig() ?? false
}

/** UI transitions stay short so animation never delays reading data (DESIGN.md: <= 300 ms). */
export const FAST = { duration: 0.15, ease: 'easeOut' } as const
