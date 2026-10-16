# smooth-stream-text with React and Streamdown

A chat page where `smooth-stream-text` paces each streamed answer and Streamdown renders the markdown and fades new words in. There is no server and no API key: a simulator replays canned answers with the uneven timing of a real model.

Verified on 2026-10-16 with smooth-stream-text 0.2.0, streamdown 2.7.0, React 19.3.1, Vite 8.3.4, Tailwind CSS 4.3.3, TypeScript 7.0.2 and Node 24.3.0.

## Run it

```sh
npm install
npm run dev          # http://localhost:5203
npm run typecheck
npm run build        # type-checks, then writes dist/
npm run preview      # serves dist/ on http://localhost:5303; pass -- --port <n> for another port
```

## Where the pacing is wired

All of it is in `src/AssistantMessage.tsx`. Each answer calls `useSmoothText(text, { done: !streaming })` and gives the smoothed string to `<Streamdown animated isAnimating={phase !== 'done'}>`. The library decides how much of the answer is visible and Streamdown animates it, so there is one animation layer, not two fighting over the same words.

History needs nothing special. The two turns the page opens with reach the hook already finished, so they come back complete with phase `done`, and Streamdown renders them without animation.

Show all calls `flush()` and keeps calling it while the rest of the answer arrives, so nothing after the click is paced. Stop aborts the transport; the answer is then closed, and the text that is still paced drains in under a second. When an answer is fully on screen, a visually hidden status region says "Answer complete". The streaming text itself is not a live region.

Streamdown's fade does not check `prefers-reduced-motion`, so `src/index.css` turns it off for readers who ask for less motion. The pacing still runs.

Streamdown's components are styled with Tailwind utilities, which is why this app uses Tailwind 4. `src/index.css` points Tailwind at Streamdown's files with `@source` and defines the color tokens its classes use. Streamdown and its markdown pipeline are most of the 235 kB (gzipped) bundle, and Vite prints a chunk size warning about it.

## Using a real transport

Replace `src/simulated-stream.ts`. `src/App.tsx` appends each chunk to the answer's text and sets `streamingId` back to `null` in a `finally` block, so an answer is closed whether its stream ended, was stopped or failed. With a fetch stream, SSE or a WebSocket, keep that loop and pass the `AbortController` signal so Stop works. With the AI SDK, take the text from the `useChat` messages and derive `streaming` from `status`, as in the AI SDK recipe in the library README.

## Tests

`e2e/app.spec.ts` holds the Playwright tests. They run from the repository root, which provides `@playwright/test`, against `npm run preview -- --port 5303`.
