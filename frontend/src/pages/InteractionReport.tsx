import { ArrowLeft, Download, EyeOff, FileWarning, FlaskConical, History, Printer } from 'lucide-react'
import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { Link, useNavigate, useParams } from 'react-router'

import { RedactedText } from '@/components/RedactedText'
import { ErrorState } from '@/components/States'
import { StatusPill } from '@/components/StatusPill'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { FLAG_LABELS, languageName } from '@/features/console/language'
import { changedFacts, claimFix, customerOutcome, trustLines } from '@/features/report/report'
import { NODE_LABELS } from '@/features/verdict/waterfallLayout'
import { Waterfall } from '@/features/verdict/Waterfall'
import { useDomain } from '@/app/Domain'
import { ApiError, api } from '@/lib/api'
import { categoryLabel, formatMs, fullTime } from '@/lib/format'
import type { AuditReport, Language, ReportClaim } from '@/lib/types'
import { usePolling } from '@/lib/usePolling'
import { cn } from '@/lib/utils'
import { VERDICTS } from '@/lib/verdicts'

const CHANNELS: Record<string, string> = { console: 'Live console', site: 'Customer site', redteam: 'Red Team Lab', eval: 'Evaluation' }
const REVIEW: Record<string, string> = { none: 'Not needed', pending: 'Waiting for a person', resolved: 'Resolved by a reviewer' }

function Section({ title, children, className }: { title: string; children: ReactNode; className?: string }) {
  return (
    <section className={cn('break-inside-avoid-page space-y-3', className)}>
      <h2 className="border-b border-line pb-1.5 font-heading text-xl font-semibold">{title}</h2>
      {children}
    </section>
  )
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="break-inside-avoid">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="font-medium">{children}</dd>
    </div>
  )
}

function ClaimsTable({ claims, language }: { claims: ReportClaim[]; language: Language }) {
  if (!claims.length) return <p className="text-muted-foreground">No factual claims in this draft.</p>
  return (
    <table className="w-full table-fixed border-collapse text-left text-sm">
      <colgroup><col className="w-8" /><col /><col className="w-28" /><col className="w-[38%]" /></colgroup>
      <thead className="text-muted-foreground">
        <tr className="border-b border-line">
          <th scope="col" className="py-1.5 pr-2 font-medium">#</th>
          <th scope="col" className="py-1.5 pr-3 font-medium">Claim</th>
          <th scope="col" className="py-1.5 pr-3 font-medium">Verdict</th>
          <th scope="col" className="py-1.5 font-medium">Evidence</th>
        </tr>
      </thead>
      <tbody>
        {claims.map((c, i) => {
          const v = VERDICTS[c.verdict]
          const Icon = v.icon
          const fix = claimFix(c)
          return (
            <tr key={i} className="break-inside-avoid border-b border-line/70 align-top last:border-0">
              <td className="py-2 pr-2 tabular-nums text-muted-foreground">{i + 1}</td>
              <td className="py-2 pr-3">
                <p className="text-base">{c.text_en || c.text}</p>
                {language !== 'en' && c.text !== c.text_en && <p className="text-muted-foreground" lang={language}>{c.text}</p>}
                <p className="text-muted-foreground">
                  {categoryLabel(c.category)}
                  {c.manual_section && <> · manual: {c.manual_section.split(' > ').pop()}</>}
                </p>
                {fix && <p className="mt-1"><span className="text-muted-foreground">Correction: </span>{fix}</p>}
              </td>
              <td className="print-exact py-2 pr-3">
                <span className={cn('inline-flex items-center gap-1 font-semibold', v.text)}>
                  <Icon className="size-4" aria-hidden /> {v.label}
                </span>
                {c.verdict !== 'supported' && (
                  <p className="text-muted-foreground">by the {c.caught_by === 'rules' ? 'rule layer' : 'Judge'}</p>
                )}
              </td>
              <td className="space-y-1.5 py-2">
                {c.evidence.length ? c.evidence.map((e) => (
                  <div key={e.fact_id}>
                    <p><span className="font-semibold">{e.fact_id}</span> {e.statement_at_answer_time}</p>
                    {e.changed_since && (
                      <p className="print-exact mt-0.5 inline-flex items-start gap-1 rounded-md border border-caution/50 bg-caution/10 px-1.5 text-caution">
                        <History className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                        Changed since: now “{e.current_statement}”
                      </p>
                    )}
                  </div>
                )) : <p className="text-muted-foreground">No verified fact covers this.</p>}
              </td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

function Report({ r }: { r: AuditReport }) {
  const { domain } = useDomain()
  const [generated] = useState(() => new Date().toISOString())  // fixed when the report loads
  const i = r.interaction
  const outcome = customerOutcome(r)
  const drift = changedFacts(r)
  const flags = r.decision.input_flags.filter((f) => FLAG_LABELS[f] && f !== 'pii_redacted')
  const spans = r.timings.spans ?? []

  return (
    <article className="space-y-7">
      <header className="space-y-1 border-b-2 border-foreground pb-4">
        <p className="text-sm text-muted-foreground">{domain.name} · VeriTrust AI guardrail</p>
        <h1 className="font-heading text-4xl font-bold">Audit report · Interaction #{i.id}</h1>
        <p className="text-sm text-muted-foreground">Report generated {fullTime(generated)}</p>
      </header>

      <Section title="Summary">
        <dl className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4">
          <Field label="Asked">{fullTime(i.ts)}</Field>
          <Field label="Channel">{CHANNELS[i.channel] ?? i.channel}</Field>
          <Field label="Language">{languageName(i.language)}</Field>
          <Field label="Outcome"><span className="print-exact"><StatusPill status={r.decision.status} /></span></Field>
          <Field label="Strictness">{r.decision.strictness ? r.decision.strictness[0].toUpperCase() + r.decision.strictness.slice(1) : '–'}</Field>
          <Field label="Rewrites">{r.decision.retries}</Field>
          <Field label="Total time">{formatMs(r.timings.total_ms)}</Field>
          <Field label="Human review">{REVIEW[r.review.status]}</Field>
        </dl>
        <div className="grid gap-4 sm:grid-cols-[auto_minmax(0,1fr)]">
          <div className="print-exact rounded-lg border border-line px-4 py-3 text-center">
            <p className="text-sm text-muted-foreground">Trust score</p>
            <p className="font-heading text-4xl font-bold tabular-nums">{r.trust.score}</p>
          </div>
          <table className="self-center justify-self-start text-sm">
            <tbody>
              {trustLines(r.trust.breakdown).map((l) => (
                <tr key={l.label}><td className="pr-6 text-muted-foreground">{l.label}</td><td className="text-right tabular-nums">{l.value}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
        {(i.injected || r.pii_redacted || flags.length > 0) && (
          <ul className="flex flex-wrap gap-2 text-sm">
            {i.injected && <li className="inline-flex items-center gap-1 rounded-full border border-line px-2"><FlaskConical className="size-3.5" aria-hidden /> Error injected on purpose (test)</li>}
            {r.pii_redacted && <li className="inline-flex items-center gap-1 rounded-full border border-line px-2"><EyeOff className="size-3.5" aria-hidden /> Personal data removed before logging</li>}
            {flags.map((f) => <li key={f} className="rounded-full border border-caution/50 px-2 text-caution">{FLAG_LABELS[f]}: ran Strict</li>)}
          </ul>
        )}
      </Section>

      <Section title="Conversation">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1">
            <h3 className="text-sm font-semibold text-muted-foreground">Customer asked</h3>
            <p className="rounded-lg border border-line p-3" lang={i.language}><RedactedText text={r.question} /></p>
          </div>
          <div className="space-y-1">
            <h3 className="text-sm font-semibold text-muted-foreground">{outcome.heading}</h3>
            <p className="rounded-lg border border-line p-3" lang={i.language}><RedactedText text={outcome.text} /></p>
          </div>
        </div>
      </Section>

      <Section title="Decision">
        <p>{r.decision.explanation}</p>
        {drift.length > 0 && (
          <div className="print-exact rounded-lg border border-caution/50 bg-caution/10 p-3">
            <p className="flex items-center gap-1.5 font-semibold text-caution"><History className="size-4" aria-hidden /> Verified facts changed after this answer</p>
            <ul className="mt-1 space-y-1 text-sm">
              {drift.map((d) => <li key={d.factId}><strong>{d.factId}</strong>: then “{d.then}”, now “{d.now}”</li>)}
            </ul>
          </div>
        )}
      </Section>

      {r.drafts.map((d, n) => {
        const last = n === r.drafts.length - 1
        return (
          <Section key={d.retry} title={`Draft ${d.retry + 1}${last ? (r.decision.status === 'escalated' ? ' · blocked, not sent' : ' · sent') : ' · blocked, rewritten'}`}>
            <p className="rounded-lg border border-line p-3" lang={i.language}><RedactedText text={d.text} /></p>
            {d.injected_detail && <p className="text-sm"><span className="text-muted-foreground">Injected on purpose: </span>{d.injected_detail}</p>}
            <ClaimsTable claims={d.claims} language={i.language} />
          </Section>
        )
      })}

      <Section title="Timings">
        {spans.length ? (
          <>
            <Waterfall spans={spans} totalMs={r.timings.total_ms} className="print-exact" />
            <table className="w-full text-left text-sm">
              <thead className="text-muted-foreground">
                <tr className="border-b border-line"><th scope="col" className="py-1 font-medium">Step</th><th scope="col" className="py-1 text-right font-medium">Started</th><th scope="col" className="py-1 text-right font-medium">Took</th><th scope="col" className="py-1 pl-4 font-medium">Source</th></tr>
              </thead>
              <tbody>
                {spans.map((s, k) => (
                  <tr key={k} className="border-b border-line/70 last:border-0">
                    <td className="py-1">{NODE_LABELS[s.node] ?? s.node}{s.attempt > 0 ? ` · retry ${s.attempt}` : ''}</td>
                    <td className="py-1 text-right tabular-nums">{formatMs(s.offset_ms)}</td>
                    <td className="py-1 text-right tabular-nums">{formatMs(s.ms)}</td>
                    <td className="py-1 pl-4 text-muted-foreground">{s.provider === null ? 'local step' : s.cached ? 'cached model answer' : s.provider === 'ollama' ? 'local model (Gemma)' : 'Gemini'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        ) : <p className="text-muted-foreground">No timings were recorded.</p>}
      </Section>

      <footer className="border-t border-line pt-3 text-sm text-muted-foreground">
        From the VeriTrust AI interaction log. Questions and answers are stored with phone numbers, emails and booking codes
        removed before logging. Evidence shows each verified fact as the Judge saw it when the answer was checked.
      </footer>
    </article>
  )
}

/** Printable per-conversation audit report (FEATURES #19). Always light, A4 when printed. */
export function InteractionReport() {
  const { id } = useParams()
  const navigate = useNavigate()
  const num = Number(id)
  const fetchReport = useCallback(() => api.report(num), [num])
  const data = usePolling(fetchReport, 600_000)

  useEffect(() => {
    const previous = document.title
    document.title = `Audit report #${id} · VeriTrust AI`
    return () => { document.title = previous }
  }, [id])

  const notFound = data.error instanceof ApiError && data.error.status === 404
  const back = () => (window.history.length > 1 ? navigate(-1) : navigate(`/dashboard?id=${num}`))

  return (
    <div data-theme="light" className="min-h-dvh bg-bg text-foreground print:bg-white">
      <div className="sticky top-0 z-10 flex flex-wrap items-center gap-2 border-b border-line bg-surface/95 px-6 py-3 backdrop-blur print:hidden">
        <Button variant="ghost" onClick={back}><ArrowLeft /> Back</Button>
        <span className="mr-auto" />
        {data.data && (
          <>
            <Button variant="outline" asChild>
              <a href={`/api/interactions/${num}/report`} download={`audit-report-${num}.json`}><Download /> Download JSON</a>
            </Button>
            <Button onClick={() => window.print()}><Printer /> Print or save as PDF</Button>
          </>
        )}
      </div>
      <main className="mx-auto max-w-4xl bg-surface p-8 print:max-w-none print:p-0">
        {data.data ? (
          <Report r={data.data} />
        ) : notFound ? (
          <ErrorState
            title={`Interaction #${id} doesn't exist`}
            description={<>It may have been removed. <Link to="/dashboard" className="text-beacon underline-offset-4 hover:underline">Open the dashboard</Link> to find another.</>}
          />
        ) : data.error ? (
          <ErrorState title="Couldn't load the report" description={data.error.message} onRetry={data.refresh} />
        ) : (
          <div className="space-y-4" aria-label="Loading report">
            <FileWarning className="sr-only" aria-hidden />
            <Skeleton className="h-12 w-2/3" />
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-64 w-full" />
          </div>
        )}
      </main>
    </div>
  )
}
