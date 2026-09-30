import { CheckCircle2, TriangleAlert } from 'lucide-react'
import { useId, useState } from 'react'

import { SegmentedControl } from '@/components/SegmentedControl'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { categoryLabel } from '@/lib/format'
import { useDomain } from '@/app/Domain'
import type { Fact, FactCategory, Interaction, ReviewResolution } from '@/lib/types'
import { correctedDraft, draftIsWrong, factDraft, factMissing, lastDraft, resolutionBody, type FactForm } from './resolution'

interface Props {
  item: Interaction
  facts: Fact[]
  onSubmit: (body: ReviewResolution) => Promise<void>
}

function Field({ label, hint, children }: { label: string; hint?: string; children: (id: string) => React.ReactNode }) {
  const id = useId()
  return (
    <div className="grid gap-1.5">
      <label htmlFor={id} className="text-sm font-medium">{label}{hint && <span className="font-normal text-muted-foreground"> {hint}</span>}</label>
      {children(id)}
    </div>
  )
}

/** Approve the last draft or write the reply, and optionally save the correction as a fact. */
export function ResolutionForm({ item, facts, onSubmit }: Props) {
  const draftText = lastDraft(item)
  // A draft with a contradicted claim is wrong: start from a written reply with the Judge's
  // corrections applied, so one click can't send the hallucination to the customer.
  const wrong = draftIsWrong(item)
  const [reply, setReply] = useState<'draft' | 'written'>(wrong ? 'written' : 'draft')
  const [text, setText] = useState(() => (wrong ? correctedDraft(item) : draftText))
  const [saveFact, setSaveFact] = useState(false)
  const categories = useDomain().domain.categories.map((c) => c.id)
  const [fact, setFact] = useState<FactForm>(() => factDraft(item, facts, categories))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string>()
  const [tried, setTried] = useState(false)

  const cited = fact.id ? facts.find((f) => f.id === fact.id) : undefined
  const missing = saveFact ? factMissing(fact) : []
  const set = (patch: Partial<FactForm>) => setFact((f) => ({ ...f, ...patch }))

  const submit = async () => {
    setTried(true)
    if (missing.length || (reply === 'written' && !text.trim())) return
    setSaving(true)
    setError(undefined)
    try {
      await onSubmit(resolutionBody({ reply, text, saveFact, fact }))
    } catch (e) {
      setError((e as Error).message)
      setSaving(false)
    }
  }

  return (
    <form
      className="space-y-5"
      onSubmit={(e) => {
        e.preventDefault()
        void submit()
      }}
    >
      <div className="space-y-2">
        <SegmentedControl
          label="Reply to the customer"
          value={reply}
          onChange={setReply}
          options={[{ value: 'draft', label: 'Send the last draft' }, { value: 'written', label: 'Write a reply' }]}
        />
        {reply === 'draft' ? (
          <>
            <p className="rounded-lg border border-line bg-bg p-3" lang={item.language}>{draftText || 'There is no draft to send; write a reply instead.'}</p>
            {wrong && (
              <p role="alert" className="flex items-start gap-2 text-sm text-stop">
                <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
                This draft contradicts a verified fact. Sending it as is gives the customer a wrong answer.
              </p>
            )}
          </>
        ) : (
          <Field label="Reply">
            {(id) => <Textarea id={id} value={text} onChange={(e) => setText(e.target.value)} rows={4} lang={item.language} />}
          </Field>
        )}
      </div>

      <div className="space-y-3 rounded-xl border border-line bg-bg p-4">
        <label className="flex cursor-pointer items-start gap-2.5">
          <Checkbox checked={saveFact} onCheckedChange={(v) => setSaveFact(v === true)} className="mt-0.5" />
          <span>
            <span className="font-medium">Also save as a verified fact</span>
            <span className="block text-sm text-muted-foreground">
              Saving creates a drift event, and the Judge checks answers against it from the next question.
            </span>
          </span>
        </label>

        {saveFact && (
          <div className="grid gap-3">
            {cited && (
              <SegmentedControl
                label="Fact"
                value={fact.mode}
                onChange={(mode) => (mode === 'update' ? setFact(factDraft(item, facts, categories)) : set({ mode: 'new', id: undefined }))}
                options={[{ value: 'update', label: `Update ${cited.id}` }, { value: 'new', label: 'Add a new fact' }]}
              />
            )}
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Category">
                {(id) => (
                  <Select value={fact.category} onValueChange={(v) => set({ category: v as FactCategory })} disabled={fact.mode === 'update'}>
                    <SelectTrigger id={id} className="h-10"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {categories.map((c) => <SelectItem key={c} value={c}>{categoryLabel(c)}</SelectItem>)}
                    </SelectContent>
                  </Select>
                )}
              </Field>
              <Field label="Subject" hint="(what it is about)">
                {(id) => <Input id={id} value={fact.subject} onChange={(e) => set({ subject: e.target.value })} placeholder="musical instruments" disabled={fact.mode === 'update'} aria-invalid={tried && missing.includes('subject')} className="h-10" />}
              </Field>
              <Field label="Attribute">
                {(id) => <Input id={id} value={fact.attribute} onChange={(e) => set({ attribute: e.target.value })} placeholder="in the cabin" disabled={fact.mode === 'update'} aria-invalid={tried && missing.includes('attribute')} className="h-10" />}
              </Field>
              <div className="grid grid-cols-[minmax(0,1fr)_7rem] gap-2">
                <Field label="Value">
                  {(id) => <Input id={id} value={fact.value} onChange={(e) => set({ value: e.target.value })} placeholder="allowed" aria-invalid={tried && missing.includes('value')} className="h-10" />}
                </Field>
                <Field label="Unit" hint="(optional)">
                  {(id) => <Input id={id} value={fact.unit} onChange={(e) => set({ unit: e.target.value })} placeholder="e.g. INR" className="h-10" />}
                </Field>
              </div>
            </div>
            <Field label="Statement" hint="(the full sentence the Judge reads)">
              {(id) => <Textarea id={id} value={fact.statement} onChange={(e) => set({ statement: e.target.value })} rows={3} aria-invalid={tried && missing.includes('statement')} />}
            </Field>
            {tried && missing.length > 0 && (
              <p role="alert" className="text-sm text-stop">Fill in the {missing.join(', ')} to save the fact.</p>
            )}
          </div>
        )}
      </div>

      {error && <p role="alert" className="text-stop">{error}</p>}
      <Button type="submit" disabled={saving || (reply === 'draft' && !draftText)} className="h-11 px-5">
        <CheckCircle2 /> {saving ? 'Approving…' : 'Approve reply'}
      </Button>
    </form>
  )
}
