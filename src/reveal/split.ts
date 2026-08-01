import { clampToGraphemeBoundary } from '../core/grapheme'

export interface Piece {
  text: string
  /** Whitespace is never wrapped, so line breaking and copy stay untouched. */
  animatable: boolean
}

const WHITESPACE = /\s/

/** The smallest cluster boundary strictly after `at`. */
function nextClusterEnd(text: string, at: number): number {
  for (let end = at + 1; end < text.length; end++) {
    if (clampToGraphemeBoundary(text, end) === end) return end
  }
  return text.length
}

function pushClusters(text: string, out: Piece[]): void {
  let at = 0
  while (at < text.length) {
    const end = nextClusterEnd(text, at)
    out.push({ text: text.slice(at, end), animatable: true })
    at = end
  }
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
    else if (unit === 'word') pieces.push({ text: run, animatable: true })
    else pushClusters(run, pieces)

    at = end
  }

  return pieces
}
