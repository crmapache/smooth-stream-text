import { splitClusters } from '../core/grapheme'
import { createWordBoundaries, hasNoSpaceScript } from '../core/words'

export interface Piece {
  text: string
  /** Whitespace is never wrapped, so line breaking and copy stay untouched. */
  animatable: boolean
}

const WHITESPACE = /\s/

function pushWords(run: string, out: Piece[]): void {
  // A space-separated word is already one unit; only runs in scripts written
  // without spaces hold several words.
  if (!hasNoSpaceScript(run)) {
    out.push({ text: run, animatable: true })
    return
  }
  const words = createWordBoundaries()
  let start = 0
  for (let at = 1; at < run.length; at++) {
    if (!words.isBoundary(run, at, true)) continue
    out.push({ text: run.slice(start, at), animatable: true })
    start = at
  }
  out.push({ text: run.slice(start), animatable: true })
}

/**
 * Splits text into alternating runs of whitespace and content.
 *
 * Whitespace stays out of the animated spans: wrapping it would change line
 * breaking, and leaving it as bare text nodes is what keeps a copied selection
 * byte-identical to what is on screen.
 */
export function splitPieces(text: string, unit: 'word' | 'char'): Piece[] {
  const pieces: Piece[] = []
  let at = 0

  while (at < text.length) {
    const isSpace = WHITESPACE.test(text[at])
    let end = at + 1
    while (end < text.length && WHITESPACE.test(text[end]) === isSpace) end++

    const run = text.slice(at, end)
    if (isSpace) pieces.push({ text: run, animatable: false })
    else if (unit === 'word') pushWords(run, pieces)
    else for (const cluster of splitClusters(run)) pieces.push({ text: cluster, animatable: true })

    at = end
  }

  return pieces
}
