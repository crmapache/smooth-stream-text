# smooth-stream-text in plain JavaScript

Two chat panels on one page, fed by the same simulated stream. The left panel uses the imperative API, `createSmoothText` from `smooth-stream-text/dom`. The right one uses the `<smooth-stream-text>` Web Component. There is no framework, no TypeScript, no server and no API key: the simulator replays canned answers with the uneven timing of a real model.

Verified on 2026-10-16 with smooth-stream-text 0.2.0, Vite 8.3.4 and Node 24.3.0, in Chromium 156.

## Run it

```sh
npm install
npm run dev          # http://localhost:5206
npm run build        # writes dist/
npm run preview      # serves dist/ on http://localhost:5306; pass -- --port <n> for another port
```

## Where the pacing is wired

The imperative panel is `src/imperative-panel.js`. Each answer gets an empty element and `createSmoothText(element)`, which owns that element from then on. Every chunk goes to `push(chunk)`, and `end()` runs in a `finally` block when the stream closes, is stopped or fails. `subscribe` keeps the element's `data-phase` up to date, and `onSettled` announces "Answer complete" once the last character has faded in. Show all calls `flush()` and keeps flushing while the rest of the answer arrives. Clear chat calls `destroy()` on every handle before the elements are removed, which cancels their frames for good. History is plain text: a finished answer needs no handle, and plain text is all a handle leaves on screen once it is done.

The Web Component panel is `src/web-component-panel.js`. Importing `smooth-stream-text/web-component` registers the element. History is `<smooth-stream-text text="..." done>`, created with both attributes set before it joins the page, so the text appears at once. A live answer is an empty element: `push(chunk)` for each chunk, `end()` when the stream closes, `flush()` for Show all, and the `sst:done` event for the announcement. The element does not report phase changes, so `data-phase` is set to `streaming` when the answer starts and to `done` on `sst:done`. Clear chat only removes the elements, because an element taken out of the page pauses itself.

`src/chat-panel.js` holds what both panels share: the form, its buttons, the message list and the live region. `src/stick-to-bottom.js` keeps a list on its newest line while the reader is at the bottom. Reduced motion needs no code, since the library follows `prefers-reduced-motion` by default.

## Using a real transport

Replace `src/simulated-stream.js` and keep the loop in each panel as it is: push each chunk, call `end()` in `finally`. A fetch stream gives you text after a `TextDecoder`, SSE gives you one message per event; either way, pass the `AbortController` signal so Stop works.

## Tests

`e2e/app.spec.ts` holds the Playwright tests for both panels. They run from the repository root, which provides `@playwright/test`, against `npm run preview -- --port 5306`.
