import { wordDiff } from './wordDiff'

/**
 * Word-level diff from the first draft to the final text. Removed words are struck through,
 * added words underlined: the style differs, not only the colour.
 */
export function DraftDiff({ before, after, language }: { before: string; after: string; language: string }) {
  const parts = wordDiff(before, after, language)
  return (
    <p className="leading-7 whitespace-pre-wrap" lang={language}>
      {parts.map((p, i) =>
        p.removed ? (
          <del key={i} className="rounded-sm bg-stop/10 text-stop line-through decoration-2">
            <span className="sr-only">removed: </span>{p.value}
          </del>
        ) : p.added ? (
          <ins key={i} className="rounded-sm bg-ok/10 text-ok underline decoration-2 underline-offset-4">
            <span className="sr-only">added: </span>{p.value}
          </ins>
        ) : (
          <span key={i}>{p.value}</span>
        ),
      )}
    </p>
  )
}
