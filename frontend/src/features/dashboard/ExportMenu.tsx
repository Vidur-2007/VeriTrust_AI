import { Download, EyeOff } from 'lucide-react'
import { useState } from 'react'

import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { exportFileName, exportLink, type ExportChoice, type ExportFormat } from './exportLink'

const RANGES = [['hour', 'Last hour'], ['day', 'Last 24 h'], ['all', 'Everything']] as const
const CHANNELS = [['all', 'All channels'], ['console', 'Live console'], ['site', 'Customer site'], ['redteam', 'Red Team Lab'], ['eval', 'Evaluation']] as const
const STATUSES = [['all', 'Any status'], ['approved', 'Approved'], ['corrected', 'Corrected'], ['escalated', 'Escalated']] as const

function Choice<T extends string>({ label, value, onChange, options }: {
  label: string
  value: T
  onChange: (v: T) => void
  options: readonly (readonly [T, string])[]
}) {
  return (
    <label className="grid gap-1 text-sm">
      <span className="font-medium">{label}</span>
      <Select value={value} onValueChange={(v) => onChange(v as T)}>
        <SelectTrigger className="h-9 w-full" aria-label={label}><SelectValue /></SelectTrigger>
        <SelectContent>
          {options.map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
        </SelectContent>
      </Select>
    </label>
  )
}

/** Download interactions as CSV or JSON (FEATURES #19). The backend stores them redacted. */
export function ExportMenu() {
  const [c, setC] = useState<ExportChoice>({ range: 'day', channel: 'all', status: 'all' })
  const link = (format: ExportFormat) => (
    <Button asChild variant={format === 'csv' ? 'default' : 'outline'} className="flex-1">
      <a href={exportLink(format, c)} download={exportFileName(format, c)}>
        <Download /> {format.toUpperCase()}
      </a>
    </Button>
  )
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" className="h-10"><Download /> Export</Button>
      </PopoverTrigger>
      <PopoverContent align="end" collisionPadding={{ top: 76, bottom: 12, left: 12, right: 12 }} className="w-72 space-y-3 rounded-xl">
        <p className="font-semibold">Export interactions</p>
        <Choice label="Time" value={c.range} onChange={(range) => setC({ ...c, range })} options={RANGES} />
        <Choice label="Channel" value={c.channel} onChange={(channel) => setC({ ...c, channel })} options={CHANNELS} />
        <Choice label="Status" value={c.status} onChange={(status) => setC({ ...c, status })} options={STATUSES} />
        <div className="flex gap-2">{link('csv')}{link('json')}</div>
        <p className="flex items-start gap-1.5 text-sm text-muted-foreground">
          <EyeOff className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          Phone numbers, emails and booking codes were removed before logging, so the export has none.
        </p>
      </PopoverContent>
    </Popover>
  )
}
