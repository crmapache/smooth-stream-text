import { clampToGraphemeBoundary, codePointBefore } from './grapheme'
import { getSegmenter } from './segmenter'

const SPACE = /\s/u

/**
 * Scripts written without spaces between words. Only here does a word boundary
 * need a dictionary - which is what `Intl.Segmenter` carries.
 */
const NO_SPACE_LETTERS =
  // The prolonged sound mark and the halfwidth sound marks belong to no script,
  // but they are part of Japanese words, and the dictionary reads them so.
  '\\p{Script=Han}\\p{Script=Hiragana}\\p{Script=Katakana}\\p{Script=Thai}\\p{Script=Lao}' +
  '\\p{Script=Khmer}\\p{Script=Myanmar}\\u30FC\\uFF70\\uFF9E\\uFF9F'
const NO_SPACE = new RegExp(`[${NO_SPACE_LETTERS}]`, 'u')

/** What a run of those scripts is made of: its letters and the marks on them. */
const IN_RUN = new RegExp(`[${NO_SPACE_LETTERS}\\p{M}]`, 'u')

/**
 * Text a dictionary word needs to its right before its end is final.
 *
 * The dictionary picks the best split of a whole run, so the end of a word near
 * the live edge can still move as the run grows: `สวัส` is a word until `ดี`
 * arrives. Measured on Thai, Lao, Khmer, Burmese, Chinese and Japanese, no answer
 * changed once 22 code units followed; this leaves a margin.
 */
const LOOKAHEAD = 32

/** Punctuation that belongs to the word before it: a full stop never starts a unit. */
const CLOSING = /[\p{Pe}\p{Pf}\p{Po}]/u
/** Punctuation that belongs to the word after it. */
const OPENING = /[\p{Ps}\p{Pi}]/u

const charOf = (cp: number) => (cp < 0 ? '' : String.fromCodePoint(cp))

export interface WordBoundaries {
  /**
   * Whether a cut at `index` falls between words.
   *
   * The end of `text` only counts when `endIsFinal`: on a live stream the last
   * word may still be growing.
   */
  isBoundary(text: string, index: number, endIsFinal: boolean): boolean
  /** Forget everything cached - the text was replaced rather than extended. */
  reset(): void
}

/**
 * Where a word ends, for the purpose of showing whole words.
 *
 * In space-separated scripts that is wherever whitespace begins or ends, which
 * keeps punctuation, contractions, URLs and markup attached to their word -
 * exactly the units a reader sees. Scripts without spaces go to the dictionary
 * in `Intl.Segmenter`, through a small window around the position, with
 * punctuation kept on the word it closes or opens. Without a segmenter those
 * scripts fall back to every cluster.
 */
export function createWordBoundaries(): WordBoundaries {
  let cachedFrom = 0
  let cachedTo = 0
  let cached: Set<number> | null = null

  function segmentedAt(text: string, index: number): boolean {
    const segmenter = getSegmenter('word')
    if (!segmenter) return clampToGraphemeBoundary(text, index) === index

    // The window must reach past `index` on both sides; positions near an edge
    // that was not the end of the text get a fresh one. To the right it must reach
    // as far as an answer needs to be final, or a window cut while the text was
    // shorter would answer for positions it never saw enough of.
    const fresh =
      cached !== null &&
      (cachedFrom === 0 || index - cachedFrom >= 16) &&
      (cachedTo === text.length || cachedTo - index >= LOOKAHEAD) &&
      index > cachedFrom &&
      index < cachedTo
    if (!fresh) {
      cachedFrom = Math.max(0, index - 48)
      cachedTo = Math.min(text.length, index + 144)
      cached = new Set()
      for (const { index: at } of segmenter.segment(text.slice(cachedFrom, cachedTo))) cached.add(cachedFrom + at)
    }
    return cached!.has(index)
  }

  return {
    isBoundary(text, index, endIsFinal) {
      if (index <= 0) return true
      const before = charOf(codePointBefore(text, index))
      // Right after whitespace a cut is final, whatever comes next.
      if (SPACE.test(before)) return true
      if (index >= text.length) return endIsFinal

      const after = charOf(text.codePointAt(index)!)
      if (SPACE.test(after)) return true
      if (!NO_SPACE.test(before) && !NO_SPACE.test(after)) return false
      if (CLOSING.test(after) || OPENING.test(before)) return false
      return segmentedAt(text, index)
    },

    reset() {
      cached = null
    },
  }
}

/**
 * The last index of `text` whose word boundary can no longer change as it grows.
 *
 * Beyond it the dictionary is still deciding a word at the live edge, so a
 * caller walking forward has to ask about those positions again rather than
 * remember the answer. Everywhere else the answer is already final: it rests on
 * the two neighbouring characters, or the dictionary has seen the whole run -
 * something outside the run follows it, or `LOOKAHEAD` of it does. The end itself
 * waits for the next character, unless whitespace comes before it.
 */
export function settledWords(text: string, endIsFinal: boolean): number {
  if (endIsFinal || SPACE.test(text.charAt(text.length - 1))) return text.length
  let at = text.length
  // Without a dictionary every cluster is a word, which is final at once.
  if (getSegmenter('word')) {
    while (at > 0 && text.length - at < LOOKAHEAD) {
      const cp = codePointBefore(text, at)
      if (!IN_RUN.test(charOf(cp))) break
      at -= cp > 0xffff ? 2 : 1
    }
  }
  return Math.max(0, Math.min(at, text.length - 1))
}

/** Whether `text` contains a script written without spaces between words. */
export const hasNoSpaceScript = (text: string) => NO_SPACE.test(text)
