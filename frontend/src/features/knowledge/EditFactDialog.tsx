import { useState } from 'react'

import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { DraftDiff } from '@/features/console/DraftDiff'
import { api } from '@/lib/api'
import { categoryLabel, formatValue } from '@/lib/format'
import type { Fact, FactUpdateResult } from '@/lib/types'
import { previewStatement } from './statement'

interface Props {
  fact: Fact | null
  onClose: () => void
  onSaved: (result: FactUpdateResult) => void
}

function Form({ fact, onClose, onSaved }: { fact: Fact; onClose: () => void; onSaved: Props['onSaved'] }) {
  const [value, setValue] = useState(fact.value)
  const [statement, setStatement] = useState(fact.statement)
  // Once the statement is edited by hand, value edits stop rewriting it.
  const [touched, setTouched] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string>()

  const onValue = (v: string) => {
    setValue(v)
    if (!touched) setStatement(previewStatement(fact.statement, fact.value, v) ?? fact.statement)
  }
  const valueFound = previewStatement(fact.statement, fact.value, fact.value) !== null
  const statementStale = value.trim() !== fact.value && statement === fact.statement

  const changed = value.trim() !== fact.value || statement.trim() !== fact.statement
  const save = async () => {
    setSaving(true)
    setError(undefined)
    try {
      const change: { value?: string; statement?: string } = {}
      if (value.trim() !== fact.value) change.value = value.trim()
      if (statement.trim() !== fact.statement) change.statement = statement.trim()
      onSaved(await api.updateFact(fact.id, change))
    } catch (e) {
      setError((e as Error).message)
      setSaving(false)
    }
  }

  return (
    <form
      className="grid gap-4"
      onSubmit={(e) => {
        e.preventDefault()
        if (changed && value.trim() && statement.trim() && !saving) void save()
      }}
    >
      <DialogHeader className="pr-8">
        <DialogTitle className="text-xl font-semibold">Edit {fact.id}</DialogTitle>
        <DialogDescription>
          {categoryLabel(fact.category)} · {fact.subject} · {fact.attribute}. The Judge checks answers against this
          from the next question on.
        </DialogDescription>
      </DialogHeader>

      <label className="grid gap-1.5">
        <span className="font-medium">Value{fact.unit && <span className="font-normal text-muted-foreground"> ({fact.unit})</span>}</span>
        <Input value={value} onChange={(e) => onValue(e.target.value)} autoFocus className="h-10 text-base" />
        <span className="text-sm text-muted-foreground">Now: {formatValue(fact.value, fact.unit)}</span>
      </label>

      <label className="grid gap-1.5">
        <span className="font-medium">Statement</span>
        <Textarea
          value={statement}
          onChange={(e) => { setStatement(e.target.value); setTouched(true) }}
          rows={3}
          className="text-base"
        />
        {statementStale && !valueFound && (
          <span className="text-sm text-caution">
            {fact.value} isn't written in the statement as a number, so update the sentence by hand.
          </span>
        )}
      </label>

      {changed && (
        <div className="grid gap-1.5">
          <span className="font-medium">Change</span>
          <div className="rounded-lg border border-line bg-bg p-3">
            <DraftDiff before={fact.statement} after={statement} language="en" />
          </div>
        </div>
      )}

      {error && <p role="alert" className="text-stop">{error}</p>}

      <DialogFooter className="-mx-6 -mb-6 bg-surface-2 px-6">
        <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
        <Button type="submit" disabled={!changed || !value.trim() || !statement.trim() || saving}>
          {saving ? 'Saving…' : 'Save fact'}
        </Button>
      </DialogFooter>
    </form>
  )
}

/** Edit a verified fact: value and statement, with a word diff of the change before saving. */
export function EditFactDialog({ fact, onClose, onSaved }: Props) {
  return (
    <Dialog open={fact !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="border border-line bg-surface p-6 sm:max-w-xl">
        {fact && <Form key={fact.id} fact={fact} onClose={onClose} onSaved={onSaved} />}
      </DialogContent>
    </Dialog>
  )
}
