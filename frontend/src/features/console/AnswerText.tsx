import { ClaimMark } from '@/components/ClaimMark'
import type { Claim, Language } from '@/lib/types'
import { ClaimDetail } from './ClaimDetail'
import { segmentText } from './claimSegments'

/** Answer text with every located claim underlined by verdict (popover on hover and focus). */
export function AnswerText({ text, claims, language }: { text: string; claims: Claim[]; language: Language }) {
  const { segments } = segmentText(text, claims)
  return (
    <p className="leading-7 whitespace-pre-wrap" lang={language}>
      {segments.map((s, i) =>
        s.kind === 'text' ? (
          <span key={i}>{s.text}</span>
        ) : (
          <ClaimMark key={i} verdict={s.claim.verdict} detail={<ClaimDetail claim={s.claim} language={language} />}>
            {s.text}
          </ClaimMark>
        ),
      )}
    </p>
  )
}
