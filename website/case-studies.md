---
title: Case studies
description: Real projects that use smooth-stream-text, what problem it solved there and how it is wired, with links to the code. Includes a template for adding your own.
---

# Case studies

Each case links to public code at a fixed commit, so you can check how the package is
used. Cases written by the package's author say so.

## Amazing Claude Code

*Written by the author of smooth-stream-text, who also builds this app.*

[Amazing Claude Code](https://github.com/crmapache/amazing-claude-code) is an open-source
chat panel for Claude Code inside JetBrains IDEs. The panel is a React 19 app in the
IDE's embedded browser, and it renders answers with its own Markdown renderer.

**Problem.** The answer reaches the panel as the Claude Code CLI prints it: sometimes a
few characters, sometimes dozens of words in one event, with pauses while the model
works. Rendering each event as it arrived made the text jump forward in batches.

**Integration.** smooth-stream-text 0.2.0, two layers:

- Pacing: one `useSmoothStream` call paces the answer that is currently streaming, with
  `done` following the CLI's stream
  ([`Feed.tsx`, line 285](https://github.com/crmapache/amazing-claude-code/blob/fb06ee816c21044ea4ef7b3f287b5801545682c0/webview/src/components/Feed.tsx#L285)).
  Finished answers are not paced at all.
- Reveal: the panel's own Markdown renderer wraps each text run it produces in `Reveal`
  ([`Markdown.tsx`, line 175](https://github.com/crmapache/amazing-claude-code/blob/fb06ee816c21044ea4ef7b3f287b5801545682c0/webview/src/components/items/Markdown.tsx#L175)),
  and one `RevealProvider` per message keeps the wave continuous across paragraphs
  ([`TextCard.tsx`, line 121](https://github.com/crmapache/amazing-claude-code/blob/fb06ee816c21044ea4ef7b3f287b5801545682c0/webview/src/components/items/TextCard.tsx#L121)).

Pacing and reveal read the same `unit` setting (`'char'`), so the pace and the
animation stop at the same places
([`TextCard.tsx`, line 56](https://github.com/crmapache/amazing-claude-code/blob/fb06ee816c21044ea4ef7b3f287b5801545682c0/webview/src/components/items/TextCard.tsx#L56)).
On touch screens the blur is turned off and only opacity animates.

**Result and limits.** The answer now flows at an even rate instead of arriving in
batches. This was judged by eye in daily use; there are no before-and-after
measurements for this app. For numbers on recorded streams, see the
[benchmarks](/benchmarks).

## Add yours

If your project uses smooth-stream-text and the code is public, open an issue or a pull
request on [GitHub](https://github.com/crmapache/smooth-stream-text) with:

1. The project, a link to its code, and who you are in relation to it.
2. The problem: what streamed text looked like before.
3. The stack: framework, renderer, transport, and the smooth-stream-text version.
4. How it is wired, with links to the lines at a fixed commit.
5. What changed, and how you know: a measurement, a recording, or "judged by eye".
6. Anything that did not work well.

Only what you are happy to publish. Your own words about the result, good or bad, are
what makes a case useful.
