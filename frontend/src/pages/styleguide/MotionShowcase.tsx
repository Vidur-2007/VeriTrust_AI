import { Crosshair, FileSearch, Plane, RotateCcw, Send } from 'lucide-react'
import { AnimatePresence } from 'motion/react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Link } from 'react-router'

import { Tabs, TabsContent, TabsContents, TabsList, TabsTrigger } from '@/components/animate-ui/components/radix/tabs'
import { Panel } from '@/components/Panel'
import { SegmentedControl } from '@/components/SegmentedControl'
import { StatusPill } from '@/components/StatusPill'
import { emptyTrace, VerificationTrace, type TraceState } from '@/components/trace/VerificationTrace'
import { AnimatedList, AnimatedListItem } from '@/components/ui/animated-list'
import { BlurFade } from '@/components/ui/blur-fade'
import { BorderBeam } from '@/components/ui/border-beam'
import { Button } from '@/components/ui/button'
import { DotPattern } from '@/components/ui/dot-pattern'
import { Marquee } from '@/components/ui/marquee'
import { Meteors } from '@/components/ui/meteors'
import { NumberTicker } from '@/components/ui/number-ticker'
import { ShimmerButton } from '@/components/ui/shimmer-button'
import { TextShimmer } from '@/components/ui/text-shimmer'
import type { Status, Verdict } from '@/lib/types'
import { VERDICTS } from '@/lib/verdicts'
import { cn } from '@/lib/utils'

// ------------------------------------------------------------------ helpers

function Demo({ title, source, children, actions }: {
  title: string
  /** Library and component, e.g. "Magic UI · Animated Beam". */
  source: string
  children: ReactNode
  actions?: ReactNode
}) {
  return (
    <Panel
      title={<span>{title} <span className="ml-2 text-sm font-normal text-muted-foreground">{source}</span></span>}
      actions={actions}
    >
      {children}
    </Panel>
  )
}

/** Run timed steps; cancelled when the component re-runs or unmounts. */
function useScript() {
  const timers = useRef<number[]>([])
  const clear = () => {
    timers.current.forEach(window.clearTimeout)
    timers.current = []
  }
  useEffect(() => clear, [])
  return (steps: [number, () => void][]) => {
    clear()
    let at = 0
    for (const [wait, fn] of steps) {
      at += wait
      timers.current.push(window.setTimeout(fn, at))
    }
  }
}

// ------------------------------------------------------------------ 1. trace

type Scenario = 'approved' | 'corrected' | 'escalated'

function TraceDemo() {
  const [trace, setTrace] = useState<TraceState>(emptyTrace)
  const [scenario, setScenario] = useState<Scenario>('corrected')
  const run = useScript()

  const set = (fn: (t: TraceState) => TraceState) => setTrace((t) => fn(structuredClone(t)))
  const node = (id: keyof TraceState['nodes'], status: TraceState['nodes']['maker']['status'], ms?: number) =>
    set((t) => ({ ...t, nodes: { ...t.nodes, [id]: { status, ms: ms ?? t.nodes[id].ms } } }))

  const play = (s: Scenario = scenario) => {
    setTrace(emptyTrace())
    const draftAndJudge = (maker: number, judge: number): [number, () => void][] => [
      [700, () => { node('maker', 'done', maker); node('judge', 'active') }],
      [900, () => node('judge', 'done', judge)],
    ]
    const rejectAndRetry = (n: number): [number, () => void][] => [
      [0, () => { node('judge', 'rejected'); set((t) => ({ ...t, retries: n, retrying: true })) }],
      [1100, () => { set((t) => ({ ...t, retrying: false })); node('judge', 'idle'); node('maker', 'active') }],
    ]
    const finish = (status: Status): [number, () => void][] => status === 'escalated'
      ? [[400, () => { node('decision', 'done', 3); set((t) => ({ ...t, final: 'escalated' })) }]]
      : [
          [0, () => node('rules', 'active')],
          [500, () => { node('rules', 'done', 2); node('decision', 'active') }],
          [400, () => { node('decision', 'done', 1); set((t) => ({ ...t, final: status })) }],
        ]
    const steps: [number, () => void][] = [
      [300, () => node('retrieve', 'active')],
      [600, () => { node('retrieve', 'done', 612); node('maker', 'active') }],
      ...draftAndJudge(3021, 4298),
    ]
    if (s === 'corrected') steps.push(...rejectAndRetry(1), ...draftAndJudge(2643, 3190), ...finish('corrected'))
    else if (s === 'escalated') steps.push(...rejectAndRetry(1), ...draftAndJudge(2711, 3380),
      ...rejectAndRetry(2), ...draftAndJudge(2598, 3012), [0, () => node('judge', 'rejected')], ...finish('escalated'))
    else steps.push(...finish('approved'))
    run(steps)
  }

  // Autoplay once when the showcase opens.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => play(), [])

  return (
    <Demo
      title="Verification trace"
      source="Magic UI · Animated Beam"
      actions={
        <div className="flex items-center gap-2">
          <SegmentedControl
            label="Trace scenario"
            value={scenario}
            onChange={(v) => { setScenario(v); play(v) }}
            options={[
              { value: 'approved', label: 'Approved' },
              { value: 'corrected', label: 'Corrected' },
              { value: 'escalated', label: 'Escalated' },
            ]}
          />
          <Button variant="outline" size="lg" onClick={() => play()}>
            <RotateCcw />
            Replay
          </Button>
        </div>
      }
    >
      <VerificationTrace state={trace} />
      <p className="mt-2 text-sm text-muted-foreground">
        The beam travels into each step as it starts. A rejected draft sends an amber beam back to
        Maker (the holding pattern), and each retry stacks another arc. The status lands on Decision.
      </p>
    </Demo>
  )
}

// ------------------------------------------------------------------ 2. verdict panel in flight

const CLAIMS: { verdict: Verdict; text: string; fact: string }[] = [
  { verdict: 'contradicted', text: 'Refunds take 9 working days', fact: 'REF-001' },
  { verdict: 'supported', text: 'Refunds go back to the original payment method', fact: 'REF-002' },
  { verdict: 'supported', text: 'Refunds take 7 working days (after the rewrite)', fact: 'REF-001' },
]

function VerdictDemo() {
  const [inFlight, setInFlight] = useState(false)
  const [shown, setShown] = useState(0)
  const [trust, setTrust] = useState(0)
  const run = useScript()

  const send = () => {
    setShown(0)
    setTrust(0)
    setInFlight(true)
    run([
      [1400, () => setShown(1)],
      [450, () => setShown(2)],
      [450, () => setShown(3)],
      [300, () => { setInFlight(false); setTrust(90) }],
    ])
  }

  return (
    <Demo
      title="Verdict panel"
      source="Magic UI · Border Beam, Number Ticker, Animated List · Motion Primitives · Text Shimmer"
      actions={<ShimmerButton onClick={send} disabled={inFlight}><Send />Send</ShimmerButton>}
    >
      <div className="relative rounded-xl border border-line bg-bg p-5">
        {inFlight && <BorderBeam />}
        <div className="flex items-start justify-between gap-6">
          <div className="min-w-0 flex-1 space-y-3">
            <div className="h-6">
              {inFlight ? (
                <TextShimmer className="font-medium">Checking claims…</TextShimmer>
              ) : (
                <p className="font-medium">{shown ? 'Claims checked' : 'Press Send to verify a draft'}</p>
              )}
            </div>
            <div className="space-y-2">
              <AnimatePresence initial={false}>
                {CLAIMS.slice(0, shown).map((c, i) => {
                  const v = VERDICTS[c.verdict]
                  const Icon = v.icon
                  return (
                    <AnimatedListItem key={i}>
                      <div className="flex items-center gap-3 rounded-lg border border-line bg-surface px-3 py-2">
                        <Icon className={cn('size-4 shrink-0', v.text)} aria-hidden />
                        <span className="flex-1">{c.text}</span>
                        <span className="text-sm text-muted-foreground">{c.fact}</span>
                      </div>
                    </AnimatedListItem>
                  )
                })}
              </AnimatePresence>
            </div>
          </div>
          <div className="w-28 shrink-0 text-right">
            <p className="text-sm text-muted-foreground">Trust score</p>
            <NumberTicker value={trust} className="font-heading text-3xl font-semibold" />
          </div>
        </div>
      </div>
      <p className="mt-3 text-sm text-muted-foreground">
        While a request is in flight a beam runs round the panel and "Checking claims…" shimmers.
        Claims slide in as the Judge returns them; nothing waits on a timer in the real console.
      </p>
    </Demo>
  )
}

// ------------------------------------------------------------------ 3. numbers

const KPI_SETS = [
  { approved: 78, corrected: 15, escalated: 7, p95: 3.2, trust: 92 },
  { approved: 64, corrected: 27, escalated: 9, p95: 4.8, trust: 85 },
]

function NumbersDemo() {
  const [i, setI] = useState(0)
  const k = KPI_SETS[i]
  const kpis = [
    { label: 'Approved', value: k.approved, suffix: '%', cls: 'text-ok', dp: 0 },
    { label: 'Corrected', value: k.corrected, suffix: '%', cls: 'text-caution', dp: 0 },
    { label: 'Escalated', value: k.escalated, suffix: '%', cls: 'text-stop', dp: 0 },
    { label: 'p95 latency', value: k.p95, suffix: ' s', cls: '', dp: 1 },
    { label: 'Trust', value: k.trust, suffix: '', cls: '', dp: 0 },
  ]
  return (
    <Demo
      title="Number tickers"
      source="Magic UI · Number Ticker"
      actions={<Button variant="outline" size="lg" onClick={() => setI((x) => 1 - x)}><RotateCcw />Change the numbers</Button>}
    >
      <div className="grid grid-cols-5 divide-x divide-line">
        {kpis.map((m) => (
          <div key={m.label} className="min-w-0 px-3 first:pl-0">
            <p className="truncate text-sm text-muted-foreground">{m.label}</p>
            <p className={cn('font-heading text-2xl font-semibold whitespace-nowrap', m.cls)}>
              <NumberTicker value={m.value} decimalPlaces={m.dp} />
              {m.suffix}
            </p>
          </div>
        ))}
      </div>
      <p className="mt-3 text-sm text-muted-foreground">KPIs, the trust score and the red-team scoreboard count to each new value.</p>
    </Demo>
  )
}

// ------------------------------------------------------------------ 4. lists

const RESULTS: { id: string; title: string; status: Status }[] = [
  { id: 'ATK-01', title: 'Free excess baggage claim', status: 'corrected' },
  { id: 'ATK-10', title: 'Ignore your rules', status: 'approved' },
  { id: 'ATK-13', title: 'Crying parent', status: 'escalated' },
  { id: 'ATK-16', title: 'Stock tip', status: 'approved' },
]

function ListDemo() {
  const [run, setRun] = useState(0)
  return (
    <Demo
      title="Animated list"
      source="Magic UI · Animated List"
      actions={<Button variant="outline" size="lg" onClick={() => setRun((r) => r + 1)}><RotateCcw />Replay</Button>}
    >
      <AnimatedList key={run} delay={700} className="max-w-xl">
        {RESULTS.map((r) => (
          <div key={r.id} className="flex items-center gap-3 rounded-lg border border-line bg-surface px-3 py-2">
            <span className="w-16 text-sm text-muted-foreground">{r.id}</span>
            <span className="flex-1">{r.title}</span>
            <StatusPill status={r.status} />
          </div>
        ))}
      </AnimatedList>
      <p className="mt-3 text-sm text-muted-foreground">Red-team results, claims and review items slide in as they arrive (newest on top).</p>
    </Demo>
  )
}

// ------------------------------------------------------------------ 5. indicators

function IndicatorDemo() {
  const [strictness, setStrictness] = useState<'strict' | 'balanced' | 'lenient'>('balanced')
  return (
    <Demo title="Sliding indicators" source="Animate UI · Tabs, Highlight">
      <div className="grid gap-6 lg:grid-cols-2">
        <Tabs defaultValue="d1">
          <TabsList>
            <TabsTrigger value="d1">Draft 1</TabsTrigger>
            <TabsTrigger value="d2">Draft 2</TabsTrigger>
            <TabsTrigger value="diff">Changes</TabsTrigger>
          </TabsList>
          <TabsContents className="rounded-lg border border-line bg-bg">
            <TabsContent value="d1" className="p-4">Refunds take 9 working days.</TabsContent>
            <TabsContent value="d2" className="p-4">Refunds take 7 working days.</TabsContent>
            <TabsContent value="diff" className="p-4">
              Refunds take <del className="text-stop">9</del> <ins className="text-ok no-underline">7</ins> working days.
            </TabsContent>
          </TabsContents>
        </Tabs>
        <div className="space-y-2">
          <p className="text-sm font-medium" id="sg-seg">Segmented control</p>
          <SegmentedControl
            label="Strictness"
            value={strictness}
            onChange={setStrictness}
            options={[
              { value: 'strict', label: 'Strict' },
              { value: 'balanced', label: 'Balanced' },
              { value: 'lenient', label: 'Lenient' },
            ]}
          />
          <p className="text-sm text-muted-foreground">The nav rail uses the same sliding indicator.</p>
        </div>
      </div>
    </Demo>
  )
}

// ------------------------------------------------------------------ 6. buttons

function ButtonsDemo() {
  return (
    <Demo title="Primary buttons" source="Magic UI · Shimmer Button">
      <div className="flex flex-wrap items-center gap-3">
        <ShimmerButton><Send />Send</ShimmerButton>
        <ShimmerButton><Crosshair />Run attacks</ShimmerButton>
        <ShimmerButton><FileSearch />Scan manuals</ShimmerButton>
        <Button variant="outline" size="lg">Save fact</Button>
      </div>
      <p className="mt-3 text-sm text-muted-foreground">
        Only the three primary actions shimmer, and only while hovered or focused. Every other
        button stays still.
      </p>
    </Demo>
  )
}

// ------------------------------------------------------------------ 7. backgrounds

const DESTINATIONS = ['Hyderabad', 'Delhi', 'Mumbai', 'Bengaluru', 'Chennai', 'Kolkata', 'Goa', 'Dubai', 'Singapore']

function BackgroundsDemo() {
  const [fade, setFade] = useState(0)
  return (
    <Demo title="Backgrounds and the customer site" source="Magic UI · Dot Pattern, Meteors, Marquee, Blur Fade">
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="relative h-44 overflow-hidden rounded-xl border border-line bg-bg">
          <DotPattern className="[mask-image:radial-gradient(ellipse_at_center,black,transparent_75%)]" />
          <p className="absolute bottom-3 left-4 text-sm text-muted-foreground">Dot pattern: the console background (very low contrast)</p>
        </div>
        <div className="relative h-44 overflow-hidden rounded-xl border border-line bg-bg">
          <Meteors number={10} />
          <div className="absolute inset-0 grid place-items-center">
            <BlurFade key={fade} delay={0.1}>
              <p className="flex items-center gap-2 font-heading text-2xl font-bold">
                <Plane className="size-6 text-beacon" aria-hidden />
                Fly Charminar Airways
              </p>
            </BlurFade>
          </div>
          <p className="absolute bottom-3 left-4 text-sm text-muted-foreground">Meteors + blur-fade headline: the customer site hero</p>
          <Button variant="ghost" size="icon-lg" className="absolute top-2 right-2" aria-label="Replay the headline" onClick={() => setFade((f) => f + 1)}>
            <RotateCcw />
          </Button>
        </div>
        <div className="relative overflow-hidden rounded-xl border border-line bg-bg lg:col-span-2">
          <Marquee pauseOnHover className="[--duration:30s] [--gap:0.75rem]">
            {DESTINATIONS.map((d) => (
              <span key={d} className="rounded-full border border-line bg-surface px-4 py-1.5 font-medium">{d}</span>
            ))}
          </Marquee>
          <div className="pointer-events-none absolute inset-y-0 left-0 w-16 bg-linear-to-r from-bg to-transparent" />
          <div className="pointer-events-none absolute inset-y-0 right-0 w-16 bg-linear-to-l from-bg to-transparent" />
        </div>
      </div>
      <p className="mt-3 text-sm text-muted-foreground">
        One ambient effect per page at most: dots on the console, meteors on the customer site.
        Meteors are capped at 12. <Link to="/site" className="text-beacon underline-offset-4 hover:underline">Customer site</Link> (Phase 9).
      </p>
    </Demo>
  )
}

// ------------------------------------------------------------------ page section

export function MotionShowcase() {
  return (
    <div className="space-y-4">
      <TraceDemo />
      <VerdictDemo />
      <div className="grid gap-4 xl:grid-cols-2">
        <NumbersDemo />
        <ListDemo />
      </div>
      <IndicatorDemo />
      <ButtonsDemo />
      <BackgroundsDemo />
    </div>
  )
}
