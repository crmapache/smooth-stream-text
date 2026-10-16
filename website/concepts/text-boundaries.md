---
title: Text boundaries
description: Where smooth-stream-text lets the visible text end - grapheme clusters, emoji, CJK, Thai and Arabic, whole words, and Markdown delimiters - and the limits of those guarantees.
---

# Text boundaries

The visible text is always a prefix of what arrived. Where that prefix may end
decides whether a renderer ever shows half an emoji, a lone `*` or the first half of
a URL. These rules apply only to where the cursor stops; the text itself is never
changed.

## Grapheme clusters, in every mode

The visible text never ends inside a grapheme cluster: not inside a surrogate pair, a
combining mark, a flag, an emoji ZWJ sequence such as 👩‍💻 or 👨‍👩‍👧, a Hangul syllable
or an Indic conjunct. Clusters follow Unicode's own rules (UAX #29) through
`Intl.Segmenter`. Where `Intl.Segmenter` is missing (Chrome before 87, Safari before
14.1, Firefox before 125), a smaller hand-written set of rules covers the common
cases.

While a stream is live, the last cluster may still be growing: a combining mark or
the second half of a pair can still arrive. It waits until the producer goes quiet or
more text follows. A chunk that ends in the middle of a surrogate pair therefore never
shows a glyph that then changes.

## Characters or whole words

`unit` decides what appears as one piece.

- `'char'` (the default) lets the text grow a character at a time. With the reveal,
  each character fades in place as plain inline text, so line breaking and joined
  scripts such as Arabic are never disturbed.
- `'word'` only ever adds whole words. In space-separated languages a word ends where
  whitespace starts or ends, so punctuation, contractions and URLs stay with their
  word. Chinese, Japanese, Thai and other scripts written without spaces are split at
  dictionary words through `Intl.Segmenter`. Because the dictionary can change its
  mind at the live edge, such a word waits until something outside its script follows
  or enough further text arrives.

With `'word'`, the last, possibly unfinished word of a live stream waits until the
producer has been silent for `holdMs`.

## Markdown boundaries

`boundary: 'markdown'`, the default, keeps the visible prefix from being something a
Markdown parser would render wrongly:

- never inside a delimiter run: `**`, `~~`, a code fence, the `](` of a link;
- never while an inline construct is open: emphasis, inline code, a link, a
  line-leading `#`, `-`, `>` or `1.` before its first word, a table row before its
  newline;
- never inside a fence marker. The body of a fenced code block is not held, because
  holding it until the closing fence would stall the answer for thousands of
  characters.

Two safety valves keep a hold from becoming a freeze:

- if the producer has been silent for `holdMs` (1500 ms), the closing delimiter is
  not coming and the held text is released;
- if a hold would withhold more than `holdChars` (120) characters, the construct is
  not closing soon, and the cursor carries on at its normal pace with the markup
  shown literally.

The scanner is a pragmatic approximation, not a CommonMark parser. Inline state
resets at every newline, which bounds each hold to one line. A false positive costs a
short hold and nothing else.

## Other modes

| `boundary` | Stops at |
| --- | --- |
| `'markdown'` | Grapheme clusters, outside open Markdown constructs. |
| `'char'` | Any grapheme cluster. No Markdown rules. |
| `'word'` | Whole words. No Markdown rules. |
| a function | Whatever you return. |

A custom boundary is `(source, desired, closed) => number` and returns the largest
allowed index at or before `desired`. `closed` says whether the producer has closed
the stream.

## What this is not

- **Not a Markdown parser.** It decides where the visible text may end. Rendering,
  syntax highlighting and Markdown extensions stay with your renderer.
- **Not a sanitizer.** The visible text is a prefix of what arrived, byte for byte.
  If your renderer accepts raw HTML, sanitizing it is the renderer's job, exactly as
  without pacing.
- **Not a token counter.** Positions and rates are UTF-16 code units, the way
  JavaScript string lengths count. A "character per second" here is a code unit per
  second, which is not a model token.
