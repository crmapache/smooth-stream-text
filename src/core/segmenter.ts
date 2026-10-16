/**
 * Shared `Intl.Segmenter` instances, created on first use.
 *
 * Every engine this package targets ships one (Node 16+, Chrome 87+, Safari
 * 14.1+, Firefox 125+), but nothing here may assume it: without it the callers
 * fall back to a hand-written approximation rather than failing.
 */
type Granularity = 'grapheme' | 'word'

const cache: Partial<Record<Granularity, Intl.Segmenter | null>> = {}

export function getSegmenter(granularity: Granularity): Intl.Segmenter | null {
  let segmenter = cache[granularity]
  if (segmenter === undefined) {
    segmenter =
      typeof Intl !== 'undefined' && typeof Intl.Segmenter === 'function'
        ? new Intl.Segmenter(undefined, { granularity })
        : null
    cache[granularity] = segmenter
  }
  return segmenter
}
