const ZWJ = 0x200d
const KEYCAP = 0x20e3

const COMBINING = /\p{M}/u

/** How far back the scan is willing to walk before giving up on adversarial input. */
const MAX_STEPS = 128

const isHighSurrogate = (unit: number) => unit >= 0xd800 && unit <= 0xdbff
const isLowSurrogate = (unit: number) => unit >= 0xdc00 && unit <= 0xdfff
const isVariationSelector = (cp: number) => (cp >= 0xfe00 && cp <= 0xfe0f) || (cp >= 0xe0100 && cp <= 0xe01ef)
const isSkinTone = (cp: number) => cp >= 0x1f3fb && cp <= 0x1f3ff
const isRegionalIndicator = (cp: number) => cp >= 0x1f1e6 && cp <= 0x1f1ff

/** Code point ending at `index`, or -1 when `index` is 0. */
function codePointBefore(text: string, index: number): number {
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

/**
 * The largest index `<= index` that does not split a visible cluster.
 *
 * Cutting a stream mid-cluster flashes a broken glyph for a frame, so every cut
 * position goes through here regardless of the configured boundary mode. This is
 * a bounded backward scan rather than `Intl.Segmenter`: segmenting the whole
 * string on every frame would be O(n) per tick, and the scan is O(1).
 */
export function clampToGraphemeBoundary(text: string, index: number): number {
  if (index <= 0) return 0
  if (index >= text.length) return text.length

  let at = index
  for (let step = 0; step < MAX_STEPS; step++) {
    if (at <= 0) return 0

    // Mid surrogate pair - the code point starts one unit earlier.
    if (isLowSurrogate(text.charCodeAt(at))) {
      at--
      continue
    }

    const cp = text.codePointAt(at)!
    if (cp === ZWJ || cp === KEYCAP || isVariationSelector(cp) || isSkinTone(cp) || COMBINING.test(String.fromCodePoint(cp))) {
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
