---
name: smooth-stream-text
description: Integrates the smooth-stream-text npm package to pace streamed LLM text on the client, so an assistant answer that arrives in uneven bursts appears at an even rate while the project keeps its existing Markdown renderer. Use when a chat or AI UI in React, Next.js, the Vercel AI SDK (useChat), Streamdown, Vue, Nuxt, Svelte, SvelteKit, plain JavaScript or Web Components shows streamed text that jumps forward in chunks and should flow smoothly. Do not use for static Markdown rendering, SSE or network transport work, CSS-only typing effects, React Native, or projects that forbid new dependencies.
license: MIT
metadata:
  package: smooth-stream-text
  package-version: "0.2.2"
  docs: https://smooth-stream-text.vercel.app/docs/
---

# Integrating smooth-stream-text

smooth-stream-text sits between a transport and a renderer. It takes the text received
so far and whether the answer is done, and returns a prefix that grows at an even,
adaptive rate. The project keeps its renderer; only the string it renders changes.

## 1. Decide whether it fits

Use it when all of these hold:

- Text is streamed into a web UI and arrives unevenly (bursts, then pauses).
- The goal is a steadier reading experience, not a transport, parsing or styling change.
- New dependencies are allowed in this project.

Do not add it, and say why, when:

- The task is about the network (retries, reconnects, SSE parsing) or about rendering
  static Markdown. Those are other layers.
- The project already paces text in one layer (for example the AI SDK's
  `smoothStream()` transform in a route) and the user did not ask to replace it. Two
  layers add their delays. If the user wants client-side pacing instead, remove the
  server transform in the same change.
- The target is React Native, a terminal, or anything without a DOM-based UI. Only the
  web bindings are built and tested.
- The user wants a typing effect for static text. CSS is enough.

## 2. Inspect the project

Before writing code, find out:

1. The package manager, from the lockfile (`package-lock.json`, `pnpm-lock.yaml`,
   `yarn.lock`, `bun.lock`). Install with that one; never create a second lockfile.
2. The framework and version (React/Next.js, Vue/Nuxt, Svelte/SvelteKit, none).
3. Where the assistant text is rendered, and with what (react-markdown, Streamdown,
   marked, a custom parser, plain text).
4. Where the streamed text is accumulated, and what tells the UI the answer is finished
   (a `streaming` flag, the AI SDK's `status`, an `AbortController`, a `[DONE]` event).
5. Whether history (finished messages) is rendered on the server.

## 3. Install

```sh
npm install smooth-stream-text   # or pnpm add / yarn add / bun add, matching the lockfile
```

No runtime dependencies. React 18+ and Vue 3.2+ are optional peers.

## 4. Apply the matching recipe

Read only the reference you need:

| Project | Reference |
| --- | --- |
| React with any renderer | [references/react.md](references/react.md) |
| Vercel AI SDK `useChat` | [references/ai-sdk.md](references/ai-sdk.md) |
| Next.js App Router | [references/nextjs.md](references/nextjs.md) |
| Streamdown | [references/streamdown.md](references/streamdown.md) |
| Vue or Nuxt | [references/vue.md](references/vue.md) |
| Svelte or SvelteKit | [references/svelte.md](references/svelte.md) |
| Plain JavaScript or Web Component | [references/dom.md](references/dom.md) |
| Exact exports and options | [references/api.md](references/api.md) |
| Timing questions (delay, tail, Show all) | [references/latency.md](references/latency.md) |

The core pattern in React:

```tsx
import { useSmoothText } from 'smooth-stream-text/react'

function Answer({ text, streaming }: { text: string; streaming: boolean }) {
  const { text: visible, phase } = useSmoothText(text, { done: !streaming })
  return <Markdown>{visible}</Markdown> // the project's existing renderer
}
```

Rules that hold in every binding:

- Pass the **accumulated** text, not the latest delta. For deltas, use
  `useSmoothStreamController()` (React) or `push()` (DOM, core, Web Component).
- One paced component per assistant message. Only the newest message may be
  streaming; pass `done: true` for every other one, including server-loaded history,
  which then appears at once instead of replaying.
- Set `done` when the transport closes for any reason: finished, stopped or failed.
- Keep one animation layer. With Streamdown's `animated`, use only the pacing and set
  `isAnimating={phase !== 'done'}`; do not add `Reveal` or `SmoothText`.
- React hooks are client-only. In Next.js, use them in `'use client'` components.
- In Svelte, call `store.apply(text, done)` once during setup as well as in `$effect`,
  so server-rendered history contains the text.
- Import only from `smooth-stream-text`, `/react`, `/vue`, `/svelte`, `/dom`,
  `/web-component` or `/styles.css`. Do not import from `src/` or `dist/`.
- The package is `smooth-stream-text`. `smooth-stream` and `use-smooth-text` are
  unrelated packages; `use-smooth-text` also exports a `useSmoothText` hook, so check the
  import path is `smooth-stream-text/react`.

## 5. Verify

Run the project's own checks (typecheck, lint, build, tests). Then check behaviour, in a
browser if the project has one available:

- Finished messages are fully visible on first render and do not animate.
- A new answer appears progressively and ends with the complete text (compare its last
  sentence with what the transport sent).
- Stop or abort closes the answer; the visible text finishes draining within about a
  second and the UI can send again.
- A second question after the first works.
- Emoji, Chinese, Japanese or Arabic text is never shown broken mid-character.
- With `prefers-reduced-motion`, nothing animates (the default respects it).
- The growing text is not inside an `aria-live` region; if completion is announced, it
  is announced once.

## 6. When unsure

Do not invent options, exports or behaviour. Read [references/api.md](references/api.md),
or fetch the current docs: https://smooth-stream-text.vercel.app/llms.txt lists every
page as plain Markdown. If no recipe fits the project, say so and stop rather than
forcing an integration.
