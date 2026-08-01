import { clampToGraphemeBoundary } from './grapheme'
import { createMarkdownScanner, type MarkdownScanner } from './markdown-scan'

/** Returns the largest index `<= desired` the cursor may stop at. */
export type BoundaryFn = (source: string, desired: number, closed: boolean) => number

export type BoundaryMode = 'char' | 'word' | 'markdown' | BoundaryFn

export interface BoundaryResolver {
  resolve(source: string, desired: number, closed: boolean): number
  reset(): void
}

const WHITESPACE = /\s/

function lastWordBoundary(source: string, desired: number): number {
  let at = desired
  while (at > 0 && !WHITESPACE.test(source[at - 1])) at--
  return at
}

/**
 * Decides where the visible prefix is allowed to end.
 *
 * Grapheme safety applies in every mode - cutting a cluster flashes a broken
 * glyph. On top of that, `'markdown'` refuses to stop inside a delimiter run or
 * while an inline construct is unclosed, which is what stops a consumer's
 * markdown parser from rendering a half-written `**` for a frame.
 *
 * A resolver is stateful and assumes an append-only source; `reset()` starts over.
 */
export function createBoundaryResolver(mode: BoundaryMode): BoundaryResolver {
  let scanner: MarkdownScanner | null = null
  if (mode === 'markdown') scanner = createMarkdownScanner()

  return {
    resolve(source, desired, closed) {
      const capped = Math.min(Math.max(desired, 0), source.length)

      // Nothing more is coming, so no hold can ever be satisfied.
      if (closed && capped >= source.length) return source.length

      const safe = clampToGraphemeBoundary(source, capped)
      let allowed: number
      if (mode === 'char') allowed = safe
      else if (mode === 'word') allowed = lastWordBoundary(source, safe)
      else if (mode === 'markdown') allowed = scanner!.cleanUpTo(source, safe)
      else allowed = mode(source, safe, closed)

      return clampToGraphemeBoundary(source, Math.min(allowed, safe))
    },

    reset() {
      scanner?.reset()
    },
  }
}
