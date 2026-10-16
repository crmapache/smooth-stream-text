import { clampToGraphemeBoundary, isHighSurrogate, lastClusterStart } from './grapheme'
import { createMarkdownScanner, type MarkdownScanner } from './markdown-scan'
import { createWordBoundaries, settledWords, type WordBoundaries } from './words'

/** Returns the largest index `<= desired` the cursor may stop at. */
export type BoundaryFn = (source: string, desired: number, closed: boolean) => number

export type BoundaryMode = 'char' | 'word' | 'markdown' | BoundaryFn

/** What appears as one piece: a single character, or a whole word. */
export type TextUnit = 'char' | 'word'

/** Whether the cursor stops only between whole words for this mode and unit. */
export const stopsAtWords = (mode: BoundaryMode, unit: TextUnit) =>
  mode === 'word' || (unit === 'word' && typeof mode !== 'function')

export interface BoundaryResolver {
  /**
   * `quiet` says whether the producer of an open stream has gone silent. `true`
   * lets the end of the source count as the end of a word; `false` also holds
   * back the last cluster, which may still grow - a combining mark, the second
   * half of a surrogate pair. Left out, the end of the source is a fine cut but
   * not the end of a word, as before the argument existed.
   */
  resolve(source: string, desired: number, closed: boolean, quiet?: boolean): number
  reset(): void
}

const isControl = (unit: number) => unit < 0x20 || (unit >= 0x7f && unit <= 0x9f)

/**
 * The largest index `<= desired` that keeps every visible cluster whole.
 *
 * On a live stream the last cluster may still be growing - a combining mark or
 * the second half of a surrogate pair can still arrive - so it waits until the
 * producer goes quiet. A trailing half pair holds the cluster before it as well:
 * the code point it starts may join that one, as a skin tone or the next person
 * of a family does. Half of a surrogate pair is never shown on its own.
 */
export function safeCut(source: string, desired: number, closed: boolean, quiet: boolean): number {
  const capped = Math.min(Math.max(desired, 0), source.length)
  if (closed) return clampToGraphemeBoundary(source, capped)
  const end = source.length
  const halfPair = isHighSurrogate(source.charCodeAt(end - 1))
  // How far the text may be shown before the end can still change. Nothing
  // joins a line break or another control, so one before the half stays shown.
  const held = quiet
    ? halfPair
      ? end - 1
      : end
    : halfPair
      ? isControl(source.charCodeAt(end - 2))
        ? end - 1
        : clampToGraphemeBoundary(source, end - 2)
      : lastClusterStart(source)
  return clampToGraphemeBoundary(source, Math.min(capped, held))
}

/**
 * Decides where the visible prefix is allowed to end.
 *
 * Grapheme safety applies in every mode - cutting a cluster flashes a broken
 * glyph. `'markdown'` also refuses to stop inside a delimiter run or while an
 * inline construct is unclosed, which is what stops a consumer's markdown parser
 * from rendering a half-written `**` for a frame. With `unit: 'word'` - or the
 * `'word'` mode - the cursor stops only between whole words as well.
 *
 * A resolver is stateful and assumes an append-only source; `reset()` starts over.
 */
export function createBoundaryResolver(mode: BoundaryMode, unit: TextUnit = 'char'): BoundaryResolver {
  const wholeWords = stopsAtWords(mode, unit)
  const scanner: MarkdownScanner | null = mode === 'markdown' ? createMarkdownScanner() : null
  const words: WordBoundaries | null = wholeWords ? createWordBoundaries() : null

  // Word mode walks forward once, like the markdown scanner, so its cost across
  // a stream is linear rather than per frame.
  let wordPos = 0
  let lastWord = 0
  let seen = 0

  function startOver(): void {
    scanner?.reset()
    words?.reset()
    wordPos = 0
    lastWord = 0
    seen = 0
  }

  return {
    resolve(source, desired, closed, quiet) {
      // The source is contracted to be append-only; a shorter one is a new text.
      if (source.length < seen) startOver()
      seen = source.length

      // Nothing more is coming, so no hold can ever be satisfied.
      if (closed && desired >= source.length) return source.length

      const safe = safeCut(source, desired, closed, quiet !== false)

      const endIsFinal = closed || quiet === true
      // Both walks below remember what they decided, so whole words walk only as
      // far as the answers are final: a dictionary word at the live edge may still grow.
      const reach = words ? Math.min(safe, settledWords(source, endIsFinal)) : safe
      let allowed: number
      if (typeof mode === 'function') allowed = mode(source, safe, closed)
      else if (mode === 'markdown') {
        allowed = scanner!.cleanUpTo(source, reach, words ? (k) => words.isBoundary(source, k, endIsFinal) : undefined)
      } else if (words) {
        for (let k = wordPos + 1; k <= reach; k++) if (words.isBoundary(source, k, endIsFinal)) lastWord = k
        wordPos = Math.max(wordPos, reach)
        // Asked about an earlier position than before: walk back to its own word end.
        allowed = lastWord
        if (allowed > safe) {
          allowed = safe
          while (allowed > 0 && !words.isBoundary(source, allowed, endIsFinal)) allowed--
        }
      } else allowed = safe

      return clampToGraphemeBoundary(source, Math.min(allowed, safe))
    },

    reset: startOver,
  }
}
