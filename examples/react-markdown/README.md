# React + react-markdown

A chat page that keeps its markdown renderer and paces the answer with
`useSmoothText`. The stream is simulated in the browser, so there is nothing to
configure.

Verified with smooth-stream-text 0.2.0, React 19.3.1, react-markdown 10.1.0 and
Vite 8.3.4.

```sh
npm install
npm run dev
```

The page opens on http://localhost:5201.

## Where to look

`src/Answer.tsx` is the whole integration. Each assistant message calls
`useSmoothText(message.text, { done: !message.streaming })` and hands the returned
`text` to `ReactMarkdown`. Nothing else in the rendering changes.

`src/App.tsx` owns the transport. It appends every chunk to the message as it
arrives and sets `streaming: false` when the stream ends or the user presses Stop.
That is all the hook needs: it paces whatever the string has grown to, and once
`done` is true it drains the rest within about a second.

The two messages in `src/history.ts` are passed with `streaming: false`. A message
that is already done on its first render is shown at once, so a loaded
conversation does not replay.

"Show all" calls `flush`, which shows everything received so far. Text that
arrives later would be paced again, so after the click the component keeps
flushing on every new chunk until the answer ends.

When an answer is fully on screen, `phase` becomes `done`. The app uses that moment
to announce "Answer complete" in a polite live region, instead of having a screen
reader read the text as it grows.

## Using your own transport

Replace `simulateStream` in `src/App.tsx` with your fetch stream, EventSource or
WebSocket. Keep appending deltas to the message and set `streaming: false` when
your transport finishes, fails or is aborted.

## Tests

`e2e/app.spec.ts` runs against the production build from the repository root:

```sh
npm run build
EXAMPLE=react-markdown npx playwright test
```
