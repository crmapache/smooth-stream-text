/** Delimiters whose length matters, so a cut may never land inside one of their runs. */
const RUN_CHARS = new Set(['*', '_', '~', '`'])

const FENCE_LINE = /^ {0,3}(`{3,}|~{3,})(.*)$/

type MarkerKind = 'hash' | 'bullet' | 'quote' | 'ordered' | null

interface Emphasis {
  ch: string
  len: number
}

export interface MarkdownScanner {
  /**
   * The largest index `<= desired` at which the visible prefix contains no
   * unclosed inline construct and no half-written delimiter, and which `accept`
   * - when given - also allows. Each position is judged once, when the scan
   * first passes it.
   *
   * The source must be append-only between calls; `reset()` starts over.
   */
  cleanUpTo(source: string, desired: number, accept?: (index: number) => boolean): number
  reset(): void
}

/** How many clean positions behind the scan stay remembered; a stream looks back a few dozen at most. */
const RECENT = 256

/**
 * Walks the source forward exactly once, so the total cost across a stream is
 * O(length) rather than O(length) per frame.
 *
 * Inline state is cleared at every newline. That is not strictly CommonMark - a
 * code span can wrap a line - but it bounds every hold to a single line, which
 * matters far more here than perfect fidelity. Pairing is deliberately naive for
 * the same reason: a false positive only costs a brief hold, and the engine's
 * time and length caps release it.
 */
export function createMarkdownScanner(): MarkdownScanner {
  let pos = 0
  let lastClean = 0
  // Clean positions the scan has passed, newest last: a question about an earlier
  // position must get an exact answer without stepping back, since stepping over
  // the same delimiters twice would corrupt the state.
  let recent: number[] = []
  let forgotten = false

  // Block level - survives newlines.
  let inFence = false
  let fenceChar = ''
  let fenceLen = 0
  let lineStart = 0

  // Line level - cleared at every newline.
  let atLineStart = true
  let marker: MarkerKind = null
  let markerPending = false
  let inTableRow = false
  let escape = false
  let backtick = 0
  let emphasis: Emphasis[] = []
  let bracket = 0
  let awaitingParen = false
  let inUrl = false
  let urlDepth = 0
  let runChar = ''
  let runLen = 0
  let runAtLineStart = false

  function resetLine(nextLineStart: number): void {
    atLineStart = true
    marker = null
    markerPending = false
    inTableRow = false
    escape = false
    backtick = 0
    emphasis = []
    bracket = 0
    awaitingParen = false
    inUrl = false
    urlDepth = 0
    runChar = ''
    runLen = 0
    runAtLineStart = false
    lineStart = nextLineStart
  }

  /** `next` is the character after the run, which decides what a line-leading star is. */
  function finalizeRun(next: string): void {
    if (runLen === 0) return
    const ch = runChar
    const len = runLen
    const wasAtLineStart = runAtLineStart
    runChar = ''
    runLen = 0
    runAtLineStart = false

    // Inside a fence the run is literal text; it was only tracked so that a cut
    // could not land inside the closing marker.
    if (inFence) return

    // A lone star opening a line is a bullet only when a space follows it;
    // `*word*` at the start of a line is emphasis like anywhere else.
    if (ch === '*' && len === 1 && wasAtLineStart && (next === ' ' || next === '\t')) return

    if (ch === '`') {
      if (backtick === 0) backtick = len
      else if (backtick === len) backtick = 0
      return
    }
    if (backtick > 0) return // inside a code span everything else is literal
    if (ch === '~' && len < 2) return // a lone tilde is not strikethrough

    const top = emphasis[emphasis.length - 1]
    if (top && top.ch === ch && top.len === len) emphasis.pop()
    else if (emphasis.length < 8) emphasis.push({ ch, len })
  }

  function toggleFence(source: string, lineEnd: number): void {
    const match = FENCE_LINE.exec(source.slice(lineStart, lineEnd))
    if (!match) return
    const [, run, rest] = match
    if (!inFence) {
      inFence = true
      fenceChar = run[0]
      fenceLen = run.length
    } else if (run[0] === fenceChar && run.length >= fenceLen && rest.trim() === '') {
      inFence = false
    }
  }

  /** Updates the line-leading marker state for a character that is not part of a run. */
  function stepMarker(ch: string): void {
    if (!markerPending) return
    const space = ch === ' ' || ch === '\t'
    switch (marker) {
      case 'hash':
        if (ch !== '#' && !space) markerPending = false
        return
      case 'ordered':
        if (ch === '.' || ch === ')') marker = 'bullet'
        else if (!/\d/.test(ch)) markerPending = false
        return
      default:
        if (!space) markerPending = false
    }
  }

  function step(source: string, p: number): void {
    const ch = source[p]

    if (ch === '\n') {
      finalizeRun(ch)
      toggleFence(source, p)
      resetLine(p + 1)
      return
    }

    if (awaitingParen) {
      awaitingParen = false
      bracket--
      if (ch === '(') {
        inUrl = true
        urlDepth = 0
        return
      }
      // Not a link after all - the character still needs normal handling below.
    }

    if (escape) {
      escape = false
      stepMarker(ch)
      atLineStart = false
      return
    }

    if (inUrl) {
      if (ch === '(') urlDepth++
      else if (ch === ')') {
        if (urlDepth > 0) urlDepth--
        else inUrl = false
      }
      return
    }

    if (!inFence && ch === '\\') {
      finalizeRun(ch)
      escape = true
      atLineStart = false
      return
    }

    if (RUN_CHARS.has(ch)) {
      if (runLen > 0 && runChar === ch) runLen++
      else {
        finalizeRun(ch)
        runChar = ch
        runLen = 1
        runAtLineStart = atLineStart
      }
      if (atLineStart && !inFence && ch === '*') {
        marker = 'bullet'
        markerPending = true
      } else {
        stepMarker(ch)
      }
      atLineStart = false
      return
    }

    finalizeRun(ch)

    if (atLineStart) {
      if (ch === ' ' || ch === '\t') return // still in the leading indent
      atLineStart = false
      if (!inFence) {
        if (ch === '|') {
          inTableRow = true
          return
        }
        const kind: MarkerKind =
          ch === '#'
            ? 'hash'
            : ch === '>'
              ? 'quote'
              : ch === '-' || ch === '+'
                ? 'bullet'
                : /\d/.test(ch)
                  ? 'ordered'
                  : null
        if (kind) {
          marker = kind
          markerPending = true
          return
        }
      }
    }

    stepMarker(ch)

    if (inFence || backtick > 0) return

    if (ch === '[') {
      bracket++
      return
    }
    if (ch === ']' && bracket > 0) {
      awaitingParen = true
    }
  }

  function isClean(): boolean {
    if (escape || runLen > 0 || markerPending || inTableRow || awaitingParen) return false
    if (inFence) return true
    return backtick === 0 && emphasis.length === 0 && bracket === 0 && !inUrl
  }

  /** The last clean position at or before `desired`, from what the scan remembers. */
  function recentCleanUpTo(desired: number): number | null {
    let lo = 0
    let hi = recent.length - 1
    let found: number | null = null
    while (lo <= hi) {
      const mid = (lo + hi) >> 1
      if (recent[mid] <= desired) {
        found = recent[mid]
        lo = mid + 1
      } else hi = mid - 1
    }
    return found ?? (forgotten ? null : 0)
  }

  function resetAll(): void {
    pos = 0
    lastClean = 0
    recent = []
    forgotten = false
    inFence = false
    fenceChar = ''
    fenceLen = 0
    resetLine(0)
  }

  function cleanUpTo(source: string, desired: number, accept?: (index: number) => boolean): number {
    // The source is contracted to be append-only; recovering from a violation
    // costs one line, and silently reporting stale positions would not.
    if (source.length < pos) resetAll()

    const limit = Math.min(desired, source.length)
    for (let p = pos; p < limit; p++) {
      step(source, p)
      const k = p + 1
      // A run whose next character is known and different is complete; a run at
      // the very end of the source may still grow, so it stays unresolved.
      if (runLen > 0 && k < source.length && source[k] !== runChar) finalizeRun(source[k])
      if (isClean() && (!accept || accept(k))) {
        lastClean = k
        recent.push(k)
        if (recent.length > 2 * RECENT) {
          recent = recent.slice(-RECENT)
          forgotten = true
        }
      }
    }
    if (limit > pos) pos = limit
    if (lastClean <= desired) return lastClean

    // Asked about a position already passed: the last clean one before it, or,
    // that far back, a fresh scan up to it.
    const known = recentCleanUpTo(desired)
    if (known !== null) return known
    resetAll()
    return cleanUpTo(source, desired, accept)
  }

  return { cleanUpTo, reset: resetAll }
}
