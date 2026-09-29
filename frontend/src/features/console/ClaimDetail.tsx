import type { Claim, Language } from '@/lib/types'

/** Popover body for a claim: translation, evidence, manual section, and who caught it. */
export function ClaimDetail({ claim, language }: { claim: Claim; language: Language }) {
  return (
    <div className="space-y-2 text-sm">
      {language !== 'en' && claim.text_en && (
        <p><span className="text-muted-foreground">In English: </span><span className="text-foreground">{claim.text_en}</span></p>
      )}
      {claim.evidence.length ? (
        claim.evidence.map((e) => (
          <p key={e.fact_id} className="text-foreground">
            {e.statement} <span className="font-medium text-muted-foreground">{e.fact_id}</span>
          </p>
        ))
      ) : (
        <p>No verified fact covers this.</p>
      )}
      {claim.verdict !== 'supported' && (claim.rule_note || claim.correction) && (
        <p><span className="text-muted-foreground">Fix: </span><span className="text-foreground">{claim.rule_note ?? claim.correction}</span></p>
      )}
      <p className="text-muted-foreground">
        {claim.caught_by === 'rules' ? 'Caught by the rule layer' : 'Checked by the Judge'}
        {claim.manual_section && <> · Manual: {claim.manual_section.split(' > ').pop()}</>}
      </p>
    </div>
  )
}
