---
title: Accessibility
description: Reduced motion, screen readers, selection and keyboard behaviour with smooth-stream-text, and what stays the responsibility of your renderer.
---

# Accessibility

Pacing changes when text appears, and the optional reveal changes how. Both affect
people using assistive technology or reduced-motion settings. This page describes
what the package does on its own and what your app needs to do.

## Reduced motion

With the reveal (`SmoothText`, `Reveal`, `createSmoothText`, `createReveal`, the Web
Component), `respectReducedMotion` is `true` by default. When the system or browser
asks for reduced motion, no animated spans are created at all: the text is simply
extended. Switching the preference in the middle of an answer keeps the text in
order. Set `respectReducedMotion: false` only if your app offers its own setting.

Pacing itself is not an animation: the text still grows over a fraction of a second
behind the stream. If you want people who ask for reduced motion to see text exactly
as it arrives, render the received text directly for them:

```tsx
import { prefersReducedMotion } from 'smooth-stream-text/dom'

const reduce = prefersReducedMotion()
const { text } = useSmoothText(answer, { done: !streaming })
return <Markdown>{reduce ? answer : text}</Markdown>
```

`prefersReducedMotion()` reads the media query once; subscribe to
`matchMedia('(prefers-reduced-motion: reduce)')` if you need to follow changes.

## Screen readers

Do not put `aria-live` on the element whose text grows. A live region announces every
change, which for a paced answer means a stream of fragments.

Announce the finished answer once instead:

- Mark the message `aria-busy="true"` while it is streaming, if your design allows.
- When the answer is fully on screen, write a short notice ("Answer complete", or the
  answer itself if it is short) into a visually hidden polite live region. Use
  `phase === 'done'` when you render text yourself, or `onSettled` / `settled` /
  `sst:done` with the reveal.

React to the transition to `done`, not to the value, so loading a conversation (which
starts out done) does not announce every old message. The
[React guide](/react#knowing-when-an-answer-is-on-screen) shows the pattern, and every
example app does this.

## Selection and copying

With the reveal, a unit lives in a `<span>` only while it animates; afterwards it is
folded back into the surrounding text node. A finished answer is plain text with no
spans, however long it is. While text is arriving, the spans still animating stay in
the DOM: a few dozen for a typical answer, a few hundred at the peak of a very fast
stream (see the [benchmarks](/benchmarks#rendering-cost-in-a-browser)). A selection
copies exactly the characters on screen, and a selection made while the answer is
still arriving survives the folding.

## Keyboard and focus

The package adds no focusable elements and never moves focus. Controls such as Stop
or Show all belong to your app; give them visible labels and keep them reachable while
an answer streams.

## What stays with your renderer

The visible text is a prefix of what arrived, unchanged. Headings, lists, link text,
table semantics and HTML sanitization are whatever your renderer produces, exactly as
without pacing. If your renderer accepts raw HTML from the model, sanitize it there.

## Limits

These behaviours are covered by the package's tests (reduced motion, selection
folding) and by the example apps' end-to-end tests (completion announcements). That
is not an accessibility audit of your app. Test your own chat with the screen readers
your users have.
