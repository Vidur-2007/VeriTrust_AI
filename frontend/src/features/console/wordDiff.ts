import { diffWords, type ChangeObject } from 'diff'

/**
 * Word diff that keeps numbers whole. The default tokenizer splits "₹2,500" at the comma, so a
 * fee change reads "₹2̶3,5̶0̶0̶000"; the locale's word segmenter keeps "2,500" as one word.
 */
export function wordDiff(before: string, after: string, language: string): ChangeObject<string>[] {
  const intlSegmenter = typeof Intl.Segmenter === 'function' ? new Intl.Segmenter(language, { granularity: 'word' }) : undefined
  return diffWords(before, after, { intlSegmenter })
}
