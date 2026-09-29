import { FileSearch, Flag, ListChecks, PenLine, Scale, type LucideIcon } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useRef, type RefObject } from 'react'

import { AnimatedBeam } from '@/components/ui/animated-beam'
import type { Status } from '@/lib/types'
import { cn } from '@/lib/utils'

/**
 * The verification trace (DESIGN.md signature element): five nodes on a route, Animated Beams
 * between them, a curved amber beam back to Maker for every retry ("holding pattern"), and the
 * final status landing on the Decision node. Purely presentational: the console feeds it SSE
 * node events (Phase 5); /styleguide feeds it a scripted replay.
 */

export const TRACE_NODES = ['retrieve', 'maker', 'judge', 'rules', 'decision'] as const
export type TraceNodeId = (typeof TRACE_NODES)[number]
export type TraceNodeStatus = 'idle' | 'active' | 'done' | 'rejected'

export interface TraceState {
  nodes: Record<TraceNodeId, { status: TraceNodeStatus; ms?: number }>
  /** Number of Judge rejections so far; each draws one holding-pattern arc. */
  retries: number
  /** True while the latest retry beam is travelling back to Maker. */
  retrying: boolean
  final?: Status
}

export function emptyTrace(): TraceState {
  return {
    nodes: Object.fromEntries(TRACE_NODES.map((n) => [n, { status: 'idle' }])) as TraceState['nodes'],
    retries: 0,
    retrying: false,
  }
}

const META: Record<TraceNodeId, { label: string; icon: LucideIcon }> = {
  retrieve: { label: 'Retrieve', icon: FileSearch },
  maker: { label: 'Maker', icon: PenLine },
  judge: { label: 'Judge', icon: Scale },
  rules: { label: 'Rules', icon: ListChecks },
  decision: { label: 'Decision', icon: Flag },
}

const FINAL: Record<Status, { label: string; ring: string; text: string }> = {
  approved: { label: 'Approved', ring: 'border-ok text-ok', text: 'text-ok' },
  corrected: { label: 'Corrected', ring: 'border-caution text-caution', text: 'text-caution' },
  escalated: { label: 'Escalated', ring: 'border-stop text-stop', text: 'text-stop' },
}

/* Holding-pattern geometry. Arcs fly above the route (like a plane circling) so they never
   cross node labels; space for two is always reserved so nothing jumps when a retry starts. */
const TOP_SPACE = 112 // px reserved above the nodes (pt-28)
const NODE_R = 28 // node radius (size-14)
const arcCurve = (k: number) => 110 + k * 60 // quadratic control offset; peak height = half of it
// Arcs start at the top of each node (TOP_SPACE from the top); a quadratic peaks at half its curve.
const arcPeakY = (k: number) => TOP_SPACE - arcCurve(k) / 2

const GLOW = 'shadow-[0_0_0_6px_color-mix(in_srgb,var(--accent)_22%,transparent)]'

function Node({ id, state, final, nodeRef }: {
  id: TraceNodeId
  state: TraceState['nodes'][TraceNodeId]
  final?: Status
  nodeRef: RefObject<HTMLDivElement | null>
}) {
  const { label, icon: Icon } = META[id]
  const landed = id === 'decision' && final
  const ring = landed
    ? FINAL[final].ring
    : {
        idle: 'border-line text-muted-foreground',
        active: cn('border-beacon text-beacon', GLOW),
        done: 'border-beacon/60 text-foreground',
        rejected: 'border-caution text-caution',
      }[state.status]

  return (
    <div className="flex flex-col items-center gap-1.5">
      <div
        ref={nodeRef}
        className={cn(
          'relative z-10 grid size-14 place-items-center rounded-full border-2 bg-surface transition-[border-color,color,box-shadow] duration-200',
          ring,
        )}
      >
        <Icon className="size-6" aria-hidden />
      </div>
      <p className="font-heading text-lg font-semibold leading-none">{label}</p>
      <div className="grid h-8 place-items-start">
        <AnimatePresence mode="wait" initial={false}>
          {landed ? (
            // The final status lands on the Decision node (Barlow Condensed).
            <motion.p
              key={final}
              initial={{ opacity: 0, y: 6, scale: 0.94 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ duration: 0.25, ease: 'easeOut' }}
              className={cn('font-heading text-2xl font-bold leading-8', FINAL[final].text)}
            >
              {FINAL[final].label}
            </motion.p>
          ) : (
            <p key="ms" className="text-sm leading-8 text-muted-foreground tabular-nums">
              {state.ms !== undefined ? `${state.ms.toLocaleString('en-IN')} ms` : ''}
            </p>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}

export function VerificationTrace({ state, className }: { state: TraceState; className?: string }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const refs = {
    retrieve: useRef<HTMLDivElement>(null),
    maker: useRef<HTMLDivElement>(null),
    judge: useRef<HTMLDivElement>(null),
    rules: useRef<HTMLDivElement>(null),
    decision: useRef<HTMLDivElement>(null),
  }
  const { nodes, retries, retrying, final } = state
  const summary = final
    ? `Verification finished: ${FINAL[final].label}${retries ? ` after ${retries} ${retries === 1 ? 'retry' : 'retries'}` : ''}.`
    : TRACE_NODES.find((n) => nodes[n].status === 'active')
      ? `Running ${META[TRACE_NODES.find((n) => nodes[n].status === 'active')!].label}.`
      : 'Waiting for a question.'

  return (
    <div
      ref={containerRef}
      className={cn('relative px-2 pt-28 pb-2', className)}
      role="group"
      aria-label="Verification trace"
    >
      <p className="sr-only" aria-live="polite">{summary}</p>

      {/* Route segments: lit once the request has passed, travelling while it's heading in. */}
      {TRACE_NODES.slice(0, -1).map((from, i) => {
        const to = TRACE_NODES[i + 1]
        const heading = nodes[to].status === 'active'
        // Lit only if the request really went this way (an escalation skips Rules).
        const passed = nodes[from].status !== 'idle' && nodes[to].status !== 'idle'
        return (
          <AnimatedBeam
            key={`${from}-${to}`}
            containerRef={containerRef}
            fromRef={refs[from]}
            toRef={refs[to]}
            pathColor={passed ? 'color-mix(in srgb, var(--accent) 45%, var(--line))' : 'var(--line)'}
            pathWidth={3}
            active={heading}
            duration={1.2}
          />
        )
      })}

      {/* Holding pattern: one amber arc from Judge back to Maker per retry, stacked above. */}
      {Array.from({ length: retries }, (_, k) => (
        <AnimatedBeam
          key={`retry-${k}`}
          containerRef={containerRef}
          fromRef={refs.judge}
          toRef={refs.maker}
          curvature={arcCurve(k)}
          startYOffset={-NODE_R}
          endYOffset={-NODE_R}
          reverse
          pathColor="color-mix(in srgb, var(--caution) 55%, transparent)"
          pathWidth={2}
          gradientStartColor="var(--caution)"
          gradientStopColor="var(--caution)"
          active={retrying && k === retries - 1}
          duration={1.1}
        />
      ))}

      <div className="relative grid grid-cols-5">
        {TRACE_NODES.map((id) => (
          <Node key={id} id={id} state={nodes[id]} final={final} nodeRef={refs[id]} />
        ))}
      </div>

      {/* Retry labels ride on each arc's peak, between Maker (30%) and Judge (50%). */}
      {Array.from({ length: retries }, (_, k) => (
        <p
          key={`label-${k}`}
          className="absolute left-[40%] -translate-x-1/2 -translate-y-1/2 rounded-full border border-caution/50 bg-surface px-2 text-sm font-medium whitespace-nowrap text-caution"
          style={{ top: arcPeakY(k) }}
        >
          Holding pattern · retry {k + 1}
        </p>
      ))}

    </div>
  )
}
