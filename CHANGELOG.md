# Changelog

## 0.2.2 - 2026-10-16

### Fixed

- Importing only the hooks no longer bundles the reveal. `useSmoothText`,
  `useSmoothStream` and `useSmoothStreamController` from `smooth-stream-text/react`,
  and `useSmoothStream` from `smooth-stream-text/vue`, brought the reveal code along,
  because the components next to them were created by calls a bundler could not
  drop. Minified with esbuild and gzipped, the React hooks go from 8.2 kB to 4.7 kB
  and the Vue composable from 8.2 kB to 4.6 kB; the core alone is 4.2 kB. An app
  that uses the reveal bundles the same code as before. CI now fails if the hooks
  pull the reveal in again.

## 0.2.1 - 2026-10-16

### Added

- `INTEGRATION.md` ships with the package: a short guide to the entry points, the
  rules every binding follows and the common mistakes, readable offline in
  `node_modules/smooth-stream-text/`.
- The README links the new documentation at
  https://smooth-stream-text.vercel.app/docs/, with a guide per framework, six runnable
  examples and benchmarks on recorded streams.

### Fixed

- After a pause in the middle of a held construct - the last word with
  `unit: 'word'`, or an open `**`, link or table row at the live edge - the next
  chunk appeared all at once instead of being paced. While the hold lasted, the
  fractional cursor kept advancing past the text that had arrived, up to
  `holdChars` beyond it. Found by the new benchmark's bursty streams.

## 0.2.0 - 2026-10-15

### Behaviour you may notice

- The reveal animates characters by default, and each character fades in place as
  plain inline text. Before, the cursor stopped at any character while the reveal
  animated whatever arrived as a "word", so a word often appeared as two or three
  separately animated pieces; those pieces could wrap onto different lines
  mid-animation and broke joined scripts such as Arabic and Devanagari until they
  settled.
- `unit` is now one setting read by both pacing and reveal. `unit: 'word'` stops
  the cursor only between whole words - on either side of the space between them,
  where the `'word'` boundary used to stop only after it - and animates exactly
  those words, using dictionary words for Chinese, Japanese, Thai and the other
  scripts written without spaces. The `'word'` boundary used to stall on those
  scripts until `holdChars` ran out. A word at the live edge of those scripts
  waits until the dictionary can no longer change its mind, so Thai and Japanese
  words no longer appear in halves while the answer streams.
- With whole words, the last, possibly unfinished word of a live stream waits until
  the producer has been silent for `holdMs`, like any other held construct, instead
  of appearing in halves.
- The wave no longer builds a standing queue. With the old timeline, units arriving
  faster than one per `staggerMs` - nearly always - started 240 ms late; they now
  start as they arrive, and `staggerMs` spreads only real batches. The queue a
  batch leaves behind drains while the stream goes on, within twice its length.
- `onSettled` (React), `settled` (Vue), `onSettled` (Svelte action) and `sst:done`
  (Web Component) fire once per answer, after the last word has finished animating.
  They used to fire when pacing ended, while words were still fading in, and the
  Web Component announced only the first answer. An answer replaced before it
  finished is never announced, one finished while its element was paused or out
  of the page is announced when the element is drawn again, and one whose element
  is removed for good before then is not announced at all - React and the Web
  Component used to announce it as it left. Changing `as` in React or Vue no
  longer announces the same answer a second time.
- The Web Component keeps its stream when it is moved or taken out of the page and
  put back; it pauses and resumes instead of starting over.
- The stylesheet is a constructed sheet in a cascade layer, adopted by the document
  or the shadow root the element renders in.

### Fixed

- Unicode clusters are cut by Unicode's own rules (`Intl.Segmenter`): Indic
  conjuncts, Hangul jamo, tag-sequence flags, CRLF and long runs of combining marks
  are no longer split, and half of a surrogate pair is never shown.
- A chunk that ended inside a surrogate pair showed the glyph before it, which
  then changed: a hand that gained its skin tone, a person who became a family.
- Asked about an earlier position than before, the markdown boundary answered
  in the middle of a construct, and stepped back over text it had already read,
  which could leave its state wrong for the rest of the stream.
- `*italic*` at the start of a line was read as a bullet, which showed `*ita` and
  then held the rest of the line.
- Switching reduced motion on mid-answer put new text before the words still
  animating.
- `respectReducedMotion: false` was overridden by the built-in CSS.
- A selection made while the answer was arriving was lost every time finished
  words folded back into the text.
- Folding finished words rewrote the whole text node once per word; a 20 000-word
  batch took about 1.4 s in Chromium and now takes about 2 ms. Batches larger than
  `maxAnimatedUnits` animate only their tail.
- Long words such as URLs overflowed narrow columns while animating, then jumped
  onto new lines.
- Web Component, Vue and Svelte: a setting you stop passing returns to its default
  instead of keeping its last value.
- React: pacing props changed after mount were ignored - they now apply as they
  change, so a value set through `setOptions` stays until its own prop changes;
  `RevealProvider` replaced its timeline while mounted `Reveal`s kept the old
  one, and a new `resetKey` cleared the queue only after the first paragraph of
  the new message had queued behind the old one; a `Reveal` mounted again by
  StrictMode or `<Activity>` replayed its text behind the slots it had already
  taken; changing `as` left the renderer on the removed element; new text
  arriving while `done` stayed `true` left the answer open forever, and
  switching between finished messages replayed them.
- Vue: the hook reported `streaming` for finished history, did not close a second
  answer while `done` stayed `true`, and scheduled frames during server rendering;
  `RevealProvider` ignored changes to its options; changing `as` left the renderer
  on the removed element.
- Svelte: the action closed only its first answer and replayed history.
- Web Component: changing any attribute dropped pushed text; finished history was
  replayed; text pushed before the element was connected was lost; options set
  before the element was registered were ignored; removing an attribute kept its
  old value; registering under a second tag name threw.
- An open stream whose last input was half of an emoji drew every frame until
  the other half arrived; it now sleeps until the next input.
- `NaN` and other unusable settings froze a stream that kept scheduling frames
  forever; `holdChars: 0` and `adaptMs: 0` stopped it from moving, and a slow
  stream with a cap shorter than an emoji stopped in front of it. An unlimited
  `maxCharsPerSecond` stopped the stream on a frame that took no time, or once a
  pause had let the rate run to infinity; an infinite `minCharsPerSecond` now
  falls back to the default. Settings are now
  validated, with defaults for anything unusable.
- `createManualClock` ran a callback that an earlier callback in the same wave had
  cancelled.
- A destroyed DOM handle still changed the element.

### Added

- `useSmoothText` for React: the smoothed text and phase only, re-rendering when
  either changes rather than on every incoming chunk.
- `pause()` and `resume()` on the DOM handle and the Svelte store; Vue pauses
  inside a deactivated `<KeepAlive>`.
- `onSettled` and `settled` on the DOM handle.
- `apply(text, done)` on the Svelte store, and `createSourceSync` in the root entry:
  the rule every binding uses to turn a `(text, done)` pair into stream calls.
- React `SmoothText` and `Reveal` pass other props and a `ref` to their host
  element; `SmoothText` takes `unitClassName` for the animating words.
- Vue `useSmoothStream` accepts a getter for `done`.
- `text` and `done` properties on the Web Component. `text` takes `null` or
  `undefined`, which frameworks bind before the answer arrives, as no text yet.
- `unit` pacing option, shared with the reveal's `unit`.
- An optional `quiet` argument to `createBoundaryResolver(...).resolve()`: `false`
  holds back the last cluster of a live stream, which may still grow, and `true`
  lets the end of the source count as the end of a word. Left out, answers are
  those of 0.1, apart from the fixes listed here.
- `maxAnimatedUnits` reveal option.
- `smooth-stream-text/styles.css` and `REVEAL_CSS`, for `injectStyles: false`.
- Recipes for the AI SDK, Streamdown, Vue and Svelte 5 in the README.

### Package

- Every entry is built from one configuration, so an app importing the root and a
  framework entry gets one copy of the core.
- The React entry is marked `'use client'`.
- The Web Component entry can be imported on a server.
- Vue's peer range is now `>=3.2.0`; 3.0 and 3.1 lack the APIs the binding uses.
- CI runs lint, types, tests, both builds, `publint` and Are the Types Wrong on Node
  22 and 24, then installs the packed tarball on Node 18, 20, 22 and 24.
