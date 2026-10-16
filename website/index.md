---
title: What it does
description: smooth-stream-text paces streamed LLM text on the client so it appears at an even rate, while you keep your own Markdown renderer. When it fits, when it does not, and which integration to use.
---

# smooth-stream-text

A language model's answer reaches the browser unevenly: a word, then forty at once,
then nothing while the server thinks. If every chunk is rendered the moment it
lands, the text jumps, and the jumps are what the reader notices.

`smooth-stream-text` sits between your transport and your renderer. You hand it the
text received so far and whether the answer is finished. It hands back a prefix of
that text that grows at an even, adaptive rate. You render that prefix exactly as
you render text today, with react-markdown, Streamdown, marked or your own parser.

```sh
npm install smooth-stream-text
```

```tsx
import { useSmoothText } from 'smooth-stream-text/react'

function Answer({ answer, streaming }: { answer: string; streaming: boolean }) {
  const { text } = useSmoothText(answer, { done: !streaming })
  return <Markdown>{text}</Markdown>
}
```

The core has no runtime dependencies and runs without a DOM. React, Vue and Svelte
bindings and a Web Component are included; each framework is an optional peer
dependency, so you install only the one you use. A fade-in reveal for new text is
available as a separate layer and is never required.

The [playground](https://smooth-stream-text.vercel.app) streams the same answer twice,
once as it arrives and once paced, through the same renderer.

## Three separate jobs

A streaming chat view does three different things, and it helps to keep them apart:

1. **Transport** receives text: SSE, a fetch stream, a WebSocket, the AI SDK. This
   package does none of it.
2. **Pacing** decides how much of the received text is visible right now. This is
   what the package does. The rate follows the backlog: it holds the display a
   fixed distance behind the live text (180 ms by default), so a fast model is shown
   faster and a slow one slower, without a characters-per-second setting to tune.
3. **Rendering** turns visible text into markup. That stays with your renderer. The
   package only makes sure the visible prefix never ends inside a `**`, a
   half-written link or an emoji, so a Markdown renderer never flashes broken syntax.

The optional reveal animates the newly visible part. If your renderer already
animates new words, as Streamdown can, use only the pacing.

## When it fits

- Text arrives in uneven bursts and you want it to read as a steady flow.
- You already have a renderer and do not want to replace it.
- One answer can be long, multilingual or full of Markdown, and cutting it in the
  wrong place would show broken characters or syntax.
- You need history to appear at once and only new answers to be paced, across
  React StrictMode, server rendering and remounts.

## When it does not

- You only need to render Markdown, with no streaming. Use a Markdown renderer.
- You need retries, reconnects or parsing of a network protocol. That is transport.
- The text is static and you want a typing effect for a heading. CSS is enough.
- Your project already paces text in one layer, for example with the AI SDK's
  `smoothStream()` on the server, and you are happy with it. Adding a second layer
  adds a second delay; see [latency](/concepts/latency).
- You target React Native or a terminal. The core runs anywhere JavaScript runs, but
  only the web bindings are built and tested.

## Pick your integration

| You use | Start with |
| --- | --- |
| React with react-markdown or your own renderer | [React](/react) |
| The Vercel AI SDK's `useChat` | [AI SDK](/integrations/ai-sdk) |
| Next.js App Router | [Next.js](/integrations/nextjs) |
| Streamdown | [Streamdown](/integrations/streamdown) |
| Vue 3 or Nuxt | [Vue and Nuxt](/vue) |
| Svelte or SvelteKit | [Svelte and SvelteKit](/svelte) |
| Plain JavaScript, Angular, Solid, Astro | [Plain JavaScript and Web Component](/dom) |
| Something else, or a server | the [core API](/api#core) |

Every guide links to a complete example app in the
[repository](https://github.com/crmapache/smooth-stream-text/tree/main/examples). The
examples install the package from npm and are built and tested in CI on every change.

## For tools and assistants

Every page of these docs is also available as plain Markdown: add `.md` to its URL,
for example [`/docs/react.md`](https://smooth-stream-text.vercel.app/docs/react.md). [`/llms.txt`](https://smooth-stream-text.vercel.app/llms.txt)
lists them, and [`/llms-full.txt`](https://smooth-stream-text.vercel.app/llms-full.txt)
contains them all in one file. The npm package ships a short
[`INTEGRATION.md`](https://github.com/crmapache/smooth-stream-text/blob/main/INTEGRATION.md)
that can be read offline from `node_modules/smooth-stream-text/`.

If you use a coding agent that supports [Agent Skills](https://agentskills.io) (Claude
Code, Codex, Gemini CLI and others), you can install a skill that walks it through an
integration: when the package fits, which recipe matches your stack, and what to check
afterwards.

```sh
npx skills add crmapache/smooth-stream-text
```

It is optional and installs nothing into your project's dependencies. The skill's source
is in [`skills/smooth-stream-text`](https://github.com/crmapache/smooth-stream-text/tree/main/skills/smooth-stream-text).

<SourceSurvey />
