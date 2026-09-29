import { Accessibility, ArrowRight, Briefcase, CalendarClock, MapPin, Plane } from 'lucide-react'
import { useEffect, useState, type CSSProperties } from 'react'
import { Link } from 'react-router'

import { BlurFade } from '@/components/ui/blur-fade'
import { Marquee } from '@/components/ui/marquee'
import { Meteors } from '@/components/ui/meteors'
import { ChatWidget } from '@/features/site/ChatWidget'

const DESTINATIONS = ['Hyderabad', 'Delhi', 'Mumbai', 'Bengaluru', 'Chennai', 'Kolkata', 'Goa', 'Pune', 'Dubai', 'Singapore']

/** Numbers here come from the verified facts (data/facts.json), never from the manuals, so the
 *  site itself never states a stale value. */
const CARDS = [
  {
    icon: Briefcase,
    title: 'Baggage',
    body: 'One 7 kg cabin bag plus a 3 kg personal item. Checked baggage: 15 kg on Saver, 20 kg on Flex.',
    question: 'How much cabin baggage can I carry on a domestic flight?',
  },
  {
    icon: CalendarClock,
    title: 'Changes and refunds',
    body: 'Refunds to cards and UPI within 7 working days. Free changes within 48 hours of booking when you fly at least 7 days later.',
    question: 'How long does a refund take if I cancel my flight?',
  },
  {
    icon: Accessibility,
    title: 'Special assistance',
    body: 'Wheelchair assistance is free. Ask at least 48 hours before you fly, on the website, app or call centre.',
    question: 'Is wheelchair assistance free, and how early should I ask for it?',
  },
]

/** Meteors in saffron on the indigo hero: the component reads --text-muted and --accent. */
const GOLD_METEORS = { '--text-muted': '#f6d9a3', '--accent': '#e8a33d' } as CSSProperties

/** The Charminar Airways customer site (FEATURES #21): a landing page and a floating chat that
 *  uses the same guarded API. Customers only ever see final answers. */
export function Site() {
  const [chatOpen, setChatOpen] = useState(false)
  const [draft, setDraft] = useState('')

  useEffect(() => {
    const previous = document.title
    document.title = 'Charminar Airways'
    return () => { document.title = previous }
  }, [])

  const ask = (question?: string) => {
    if (question) setDraft(question)
    setChatOpen(true)
  }

  return (
    <div className="site-theme min-h-dvh font-sans">
      <a href="#site-main" className="sr-only focus:not-sr-only focus:absolute focus:top-3 focus:left-3 focus:z-50 focus:rounded-lg focus:bg-surface focus:px-3 focus:py-2">
        Skip to content
      </a>

      <section className="relative overflow-hidden bg-brand-ink text-white">
        <div className="pointer-events-none absolute inset-0" style={GOLD_METEORS} aria-hidden>
          <Meteors number={14} />
        </div>
        <header className="relative mx-auto flex max-w-6xl items-center gap-3 px-4 py-5 sm:px-6">
          <span className="grid size-10 place-items-center rounded-full bg-brand-gold text-on-gold" aria-hidden>
            <Plane className="size-5" />
          </span>
          <p className="font-heading text-2xl font-bold tracking-wide">Charminar Airways</p>
          <nav aria-label="Site" className="ml-auto hidden gap-6 text-brand-gold-soft sm:flex">
            <a href="#help" className="hover:text-white">Baggage</a>
            <a href="#help" className="hover:text-white">Refunds</a>
            <a href="#destinations" className="hover:text-white">Destinations</a>
            <button type="button" onClick={() => ask()} className="hover:text-white">Help</button>
          </nav>
        </header>

        <div id="site-main" className="relative mx-auto max-w-6xl px-4 pt-10 pb-20 sm:px-6 sm:pt-16 sm:pb-28">
          <BlurFade delay={0.05}>
            <p className="text-brand-gold-soft">Flying from Hyderabad since 2026</p>
          </BlurFade>
          <BlurFade delay={0.15}>
            <h1 className="mt-3 max-w-3xl font-heading text-5xl leading-[1.05] font-bold sm:text-7xl">
              Hyderabad to everywhere, on time.
            </h1>
          </BlurFade>
          <BlurFade delay={0.25}>
            <p className="mt-5 max-w-xl text-lg text-white/85">
              Questions about baggage, refunds or your booking? Our assistant answers from the airline's verified
              policies, in English, हिन्दी and తెలుగు.
            </p>
          </BlurFade>
          <BlurFade delay={0.35}>
            <div className="mt-8 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => ask()}
                className="inline-flex h-12 items-center gap-2 rounded-full bg-brand-gold px-6 font-semibold text-on-gold transition-colors hover:bg-brand-gold-soft"
              >
                Ask our assistant <ArrowRight className="size-4" aria-hidden />
              </button>
              <button
                type="button"
                onClick={() => ask('What does it cost to change the date of my Hyderabad to Delhi flight?')}
                className="inline-flex h-12 items-center rounded-full border border-white/40 px-6 font-semibold hover:bg-white/10"
              >
                Change a booking
              </button>
            </div>
          </BlurFade>
        </div>
      </section>

      <section id="destinations" aria-labelledby="dest-title" className="border-b border-line bg-surface py-6">
        <h2 id="dest-title" className="sr-only">Where we fly</h2>
        <ul className="sr-only">{DESTINATIONS.map((d) => <li key={d}>{d}</li>)}</ul>
        <div className="relative" aria-hidden>
          <Marquee pauseOnHover className="[--duration:36s] [--gap:0.75rem]">
            {DESTINATIONS.map((d) => (
              <span key={d} className="inline-flex items-center gap-1.5 rounded-full border border-line bg-bg px-4 py-2 font-medium">
                <MapPin className="size-4 text-beacon" /> {d}
              </span>
            ))}
          </Marquee>
          <div className="pointer-events-none absolute inset-y-0 left-0 w-20 bg-linear-to-r from-surface to-transparent" />
          <div className="pointer-events-none absolute inset-y-0 right-0 w-20 bg-linear-to-l from-surface to-transparent" />
        </div>
      </section>

      <section id="help" aria-labelledby="help-title" className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
        <h2 id="help-title" className="font-heading text-3xl font-bold">Travel with confidence</h2>
        <p className="mt-2 max-w-2xl text-muted-foreground">
          The essentials, from our verified policies. Anything else, ask the assistant: every answer is checked
          before you see it.
        </p>
        <ul className="mt-8 grid gap-5 md:grid-cols-3">
          {CARDS.map((c) => {
            const Icon = c.icon
            return (
              <li key={c.title} className="flex flex-col rounded-2xl border border-line bg-surface p-6">
                <span className="grid size-11 place-items-center rounded-xl bg-brand-gold-soft text-on-gold" aria-hidden>
                  <Icon className="size-5" />
                </span>
                <h3 className="mt-4 text-lg font-semibold">{c.title}</h3>
                <p className="mt-2 flex-1 text-muted-foreground">{c.body}</p>
                <button
                  type="button"
                  onClick={() => ask(c.question)}
                  className="mt-5 inline-flex items-center gap-1.5 self-start font-medium text-beacon underline-offset-4 hover:underline"
                >
                  Ask about this <ArrowRight className="size-4" aria-hidden />
                </button>
              </li>
            )
          })}
        </ul>
      </section>

      <footer className="bg-brand-ink text-white/85">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-8 text-sm sm:px-6">
          <p>Charminar Airways is a fictional airline for the VeriTrust AI demo.</p>
          <Link to="/" className="ml-auto text-brand-gold-soft underline-offset-4 hover:underline">Ops console</Link>
        </div>
      </footer>

      <ChatWidget open={chatOpen} onOpenChange={setChatOpen} draft={draft} onDraftChange={setDraft} />
    </div>
  )
}
