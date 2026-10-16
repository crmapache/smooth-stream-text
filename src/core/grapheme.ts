import { getSegmenter } from './segmenter'

const ZWJ = 0x200d
const KEYCAP = 0x20e3

const COMBINING = /\p{M}/u

/** How far back the fallback scan is willing to walk before giving up on adversarial input. */
const MAX_STEPS = 128

/** How far back the segmented clamp first looks; a longer cluster widens the window. */
const WINDOW = 64

export const isHighSurrogate = (unit: number) => unit >= 0xd800 && unit <= 0xdbff
const isLowSurrogate = (unit: number) => unit >= 0xdc00 && unit <= 0xdfff
const isVariationSelector = (cp: number) => (cp >= 0xfe00 && cp <= 0xfe0f) || (cp >= 0xe0100 && cp <= 0xe01ef)
const isSkinTone = (cp: number) => cp >= 0x1f3fb && cp <= 0x1f3ff
const isRegionalIndicator = (cp: number) => cp >= 0x1f1e6 && cp <= 0x1f1ff

/** Code point ending at `index`, or -1 when `index` is 0. */
export function codePointBefore(text: string, index: number): number {
  if (index <= 0) return -1
  const low = text.charCodeAt(index - 1)
  if (isLowSurrogate(low) && index >= 2 && isHighSurrogate(text.charCodeAt(index - 2))) {
    return text.codePointAt(index - 2)!
  }
  return low
}

/** Length in code units of the code point ending at `index`. */
function widthBefore(text: string, index: number): number {
  const low = text.charCodeAt(index - 1)
  return isLowSurrogate(low) && index >= 2 && isHighSurrogate(text.charCodeAt(index - 2)) ? 2 : 1
}

/**
 * The largest index `<= index` that does not split a visible cluster.
 *
 * Cutting a stream mid-cluster flashes a broken glyph for a frame, so every cut
 * position goes through here regardless of the configured boundary mode. The
 * rules are Unicode's own (UAX #29, through `Intl.Segmenter`), applied to a
 * short window around `index` rather than the whole string, so the cost does
 * not grow with the length of the answer.
 */
export function clampToGraphemeBoundary(text: string, index: number): number {
  // Written to catch NaN too, which would otherwise widen the window forever.
  if (!(index > 0)) return 0
  if (index >= text.length) return text.length
  const segmenter = getSegmenter('grapheme')
  return segmenter ? segmentedBoundary(segmenter, text, index) : scannedBoundary(text, index)
}

/**
 * Characters that never join a neighbour into one cluster: letters, digits,
 * punctuation, symbols, spaces and controls, minus the few that do - Hangul jamo
 * and syllables, the Thai and Lao vowels that are spacing marks, the halfwidth
 * kana sound marks and the Malayalam dot reph.
 */
const PLAIN = /[\p{L}\p{N}\p{P}\p{S}\p{Zs}\p{Cc}]/u
const NOT_PLAIN = /[\p{Script=Hangul}\u0E33\u0EB3\uFF9E\uFF9F\u0D4E]/u
const isPlain = (unit: number) => {
  const char = String.fromCharCode(unit)
  return PLAIN.test(char) && !NOT_PLAIN.test(char)
}

/**
 * Whether a cut at `at` falls between two plain characters, which is always a
 * cluster boundary apart from CR LF - whatever comes before or after them.
 * Checked against `Intl.Segmenter` over millions of pairs.
 */
function isPlainBoundary(text: string, at: number): boolean {
  const before = text.charCodeAt(at - 1)
  const after = text.charCodeAt(at)
  if (before === 0x0d && after === 0x0a) return false
  return (before < 0x80 && after < 0x80) || (isPlain(before) && isPlain(after))
}

function segmentedBoundary(segmenter: Intl.Segmenter, text: string, index: number): number {
  let previous = -1
  for (let reach = WINDOW; ; reach *= 4) {
    let from = Math.max(0, index - reach)
    // The window must not open between the halves of a surrogate pair, nor inside
    // a run of regional indicators, whose pairing depends on where the run began.
    if (from > 0 && isLowSurrogate(text.charCodeAt(from))) from--
    while (from > 0 && isRegionalIndicator(codePointBefore(text, from))) from -= widthBefore(text, from)

    // A few units past `index` are enough to see whether a mark or joiner follows.
    let best = from
    for (const { index: at } of segmenter.segment(text.slice(from, Math.min(text.length, index + 8)))) {
      if (from + at > index) break
      best = from + at
    }
    // The window start is a real boundary at the start of the text or between two
    // plain characters. Anywhere else it may fall inside a cluster that began
    // earlier - a long emoji sequence - and what the window finds just after it
    // may be false, so the answer stands once a wider window agrees.
    if (from === 0 || isPlainBoundary(text, from) || best === previous) return best
    previous = best
  }
}

/** Number of regional indicators in the unbroken run ending at `index`. */
function regionalIndicatorRunBefore(text: string, index: number): number {
  let count = 0
  let at = index
  while (at > 0) {
    const cp = codePointBefore(text, at)
    if (!isRegionalIndicator(cp)) break
    count++
    at -= widthBefore(text, at)
  }
  return count
}

/** The approximation used where `Intl.Segmenter` is missing: a bounded backward scan. */
function scannedBoundary(text: string, index: number): number {
  let at = index
  for (let step = 0; step < MAX_STEPS; step++) {
    if (at <= 0) return 0

    // Mid surrogate pair - the code point starts one unit earlier.
    if (isLowSurrogate(text.charCodeAt(at))) {
      at--
      continue
    }

    const cp = text.codePointAt(at)!
    if (
      cp === ZWJ ||
      cp === KEYCAP ||
      isVariationSelector(cp) ||
      isSkinTone(cp) ||
      COMBINING.test(String.fromCodePoint(cp))
    ) {
      at--
      continue
    }

    // A joiner binds what follows to what precedes it.
    if (codePointBefore(text, at) === ZWJ) {
      at--
      continue
    }

    // Flags are pairs, so an odd-length run means we are inside one.
    if (isRegionalIndicator(cp) && regionalIndicatorRunBefore(text, at) % 2 === 1) {
      at--
      continue
    }

    return at
  }

  return at
}

/**
 * Where the last cluster of `text` starts.
 *
 * On a stream that is still open the final cluster may not be finished - a
 * combining mark, the second half of a surrogate pair or the rest of an emoji
 * sequence can still arrive - so this is as far as a cut can safely go.
 */
export function lastClusterStart(text: string): number {
  return text.length === 0 ? 0 : clampToGraphemeBoundary(text, text.length - 1)
}

/** Where the cluster starting at `index` - which must be a boundary - ends. */
export function clusterEnd(text: string, index: number): number {
  if (index >= text.length) return text.length
  const segmenter = getSegmenter('grapheme')
  if (!segmenter) {
    for (let end = index + 1; end < text.length; end++) if (scannedBoundary(text, end) === end) return end
    return text.length
  }
  for (let reach = WINDOW; ; reach *= 4) {
    let to = Math.min(text.length, index + reach)
    // Cutting a surrogate pair would make its first half a cluster of its own.
    if (to < text.length && isLowSurrogate(text.charCodeAt(to))) to++
    const first = segmenter.segment(text.slice(index, to))[Symbol.iterator]().next()
    const end = index + (first.done ? 0 : first.value.segment.length)
    // A cluster that fills the whole window may go on past it.
    if (end < to || to === text.length) return end
  }
}

/**
 * Splits `text` into visible clusters in one pass.
 *
 * Splitting a whole run at once is linear; finding each boundary separately
 * would rescan the same neighbourhood for every position.
 */
export function splitClusters(text: string): string[] {
  const segmenter = getSegmenter('grapheme')
  if (segmenter) return Array.from(segmenter.segment(text), (part) => part.segment)

  const clusters: string[] = []
  let start = 0
  for (let end = 1; end <= text.length; end++) {
    if (end === text.length || scannedBoundary(text, end) === end) {
      clusters.push(text.slice(start, end))
      start = end
    }
  }
  return clusters
}
