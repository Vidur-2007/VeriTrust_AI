import { BookCheck, Search, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { toast } from 'sonner'

import { EmptyState, ErrorState } from '@/components/States'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { DriftTimeline } from '@/features/knowledge/DriftTimeline'
import { EditFactDialog } from '@/features/knowledge/EditFactDialog'
import { FactsTable } from '@/features/knowledge/FactsTable'
import { api } from '@/lib/api'
import { CATEGORY_LABELS, formatValue } from '@/lib/format'
import type { Fact, FactUpdateResult } from '@/lib/types'
import { usePolling } from '@/lib/usePolling'

/** Knowledge base (FEATURES #3, #10): the verified facts, editable, with the drift timeline. */
export function KnowledgeBase() {
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const factParam = params.get('fact')
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('all')
  const [editing, setEditing] = useState<Fact | null>(null)
  const [flashKey, setFlashKey] = useState<string | null>(null)

  const facts = usePolling(api.facts, 30_000)
  const drift = usePolling(() => api.driftEvents(50), 15_000)

  const setFact = (id: string | null) => setParams((p) => {
    const next = new URLSearchParams(p)
    if (id) next.set('fact', id)
    else next.delete('fact')
    return next
  }, { replace: true })

  const shown = useMemo(() => {
    const items = facts.data?.items ?? []
    if (factParam) return items.filter((f) => f.id === factParam)
    const q = search.trim().toLowerCase()
    return items.filter((f) =>
      (category === 'all' || f.category === category) &&
      (!q || `${f.id} ${f.subject} ${f.attribute} ${f.statement} ${f.value}`.toLowerCase().includes(q)))
  }, [facts.data, factParam, search, category])

  const onSaved = (r: FactUpdateResult) => {
    setEditing(null)
    setFlashKey(`${r.fact.id}:${Date.now()}`)
    facts.refresh()
    drift.refresh()
    const d = r.drift_event
    toast.success('Fact saved', {
      description: d
        ? `${r.fact.id}: ${d.old_value === null ? '' : `${formatValue(d.old_value, r.fact.unit)} → `}${formatValue(d.new_value, r.fact.unit)}. Answers are checked against it from now on.`
        : `${r.fact.id} was already up to date.`,
      action: { label: 'Ask in the console', onClick: () => navigate('/') },
    })
    if (d && !r.reembedded && r.fact.statement) {
      toast.warning('Saved, but retrieval still uses the old wording', {
        description: 'The embedding could not be refreshed (the model may be busy). The Judge still reads the new value from the database.',
      })
    }
  }

  const recent = facts.data?.items.filter((f) => f.recently_changed).length ?? 0

  return (
    <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <section aria-label="Verified facts" className="min-w-0 rounded-xl border border-line bg-surface">
        <header className="flex flex-wrap items-center gap-3 border-b border-line px-5 py-3">
          <div className="mr-auto">
            <h2 className="text-base font-semibold">Verified facts</h2>
            <p className="text-sm text-muted-foreground">
              {facts.data ? `${facts.data.count} facts the Judge checks against` : 'Loading…'}
              {recent > 0 && ` · ${recent} changed in 24 h`}
            </p>
          </div>
          {factParam ? (
            <Button variant="outline" onClick={() => setFact(null)}>
              <X /> Showing {factParam} · Show all
            </Button>
          ) : (
            <>
              <div className="relative">
                <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
                <Input
                  type="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search facts"
                  aria-label="Search facts"
                  className="h-10 w-44 pl-8"
                />
              </div>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger aria-label="Category" className="h-10 w-40"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All categories</SelectItem>
                  {Object.entries(CATEGORY_LABELS).map(([k, label]) => <SelectItem key={k} value={k}>{label}</SelectItem>)}
                </SelectContent>
              </Select>
            </>
          )}
        </header>

        <div className="px-2 pb-2">
          {facts.error && !facts.data ? (
            <ErrorState title="Couldn't load the facts" description={facts.error.message} onRetry={facts.refresh} className="m-3" />
          ) : !facts.data ? (
            <div className="space-y-2 p-3" aria-label="Loading facts">
              {Array.from({ length: 8 }, (_, i) => <Skeleton key={i} className="h-12 w-full bg-surface-2" />)}
            </div>
          ) : shown.length ? (
            <FactsTable facts={shown} onEdit={setEditing} flashKey={flashKey} />
          ) : (
            <EmptyState
              icon={BookCheck}
              title="No facts match"
              description={factParam ? `${factParam} isn't in the knowledge base.` : 'Try another word or category.'}
              className="m-3 border-none p-2"
            />
          )}
        </div>
      </section>

      <aside aria-label="Drift timeline" className="rounded-xl border border-line bg-surface lg:sticky lg:top-0 lg:max-h-[calc(100dvh-10rem)] lg:overflow-y-auto">
        <header className="border-b border-line px-5 py-3">
          <h2 className="text-base font-semibold">Drift timeline</h2>
          <p className="text-sm text-muted-foreground">Every change to a verified fact.</p>
        </header>
        <div className="p-5">
          <DriftTimeline
            events={drift.data?.items}
            error={drift.error}
            onRetry={drift.refresh}
            onPick={(id) => setFact(factParam === id ? null : id)}
            activeFact={factParam}
          />
        </div>
      </aside>

      <EditFactDialog fact={editing} onClose={() => setEditing(null)} onSaved={onSaved} />
    </div>
  )
}
