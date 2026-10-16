# Nuxt

A chat page rendered on the server with Nuxt. Each answer is paced with
`useSmoothStream` from `smooth-stream-text/vue` and rendered as markdown with
`marked` and `isomorphic-dompurify`. A server route streams canned answers, so
there is no API key to set up.

Verified with smooth-stream-text 0.2.0, Nuxt 4.6.1, Vue 3.5.44, marked 18.1.1,
isomorphic-dompurify 4.5.0 and TypeScript 6.0.3 on Node 24.22. Nuxt 4.6 needs
Node 22.22.3 or 24.15 and newer.

```sh
npm install
npm run dev
```

The page opens on http://localhost:5204. `npm run build` and then
`npm run preview` serve the production build on the same port. Add
`-- --port 5304` to use another one.

## Where to look

`app/components/AssistantMessage.vue` is the whole integration. It calls
`useSmoothStream(() => props.text, { done: () => !props.streaming })`, renders
the returned `text` as markdown and puts `phase` on the element as
`data-phase`. Both are computed refs.

The two earlier turns come from `server/api/history.get.ts` through `useFetch`
and are rendered with `streaming` set to false. A message that is already done
on its first render is shown at once, during server rendering too, so the
history is complete in the HTML and does not replay after hydration.

`app/app.vue` owns the conversation. `app/utils/chat.ts` posts the question,
reads the event stream with `fetch` and a reader, and calls back with every
delta. The page appends each delta to the message and sets `streaming` to false
when the stream ends or Stop aborts the request. The hook then draws what is
left within about a second.

"Show all" calls `flush`, which shows everything received so far. Text that
arrives later would be paced again, so after the click the component keeps
flushing on every new chunk until the answer ends.

When the phase becomes `done`, the component emits `done` and the page
announces "Answer complete" in a polite live region. The answer itself is not a
live region, so a screen reader does not read it as it grows.

For plain text, the `SmoothText` component from the same entry paces and
animates the text in one element: `<SmoothText :text="answer" :done="!streaming" />`.

## Using your own transport

Nothing here talks to a model. `server/api/chat.post.ts` picks the next string
from `server/answers.ts`, and `server/simulate.ts` cuts it into chunks of uneven
size with uneven delays, the way a model streams. To use a real model, forward
its deltas from that route as `data: {"delta":"..."}` events, or change
`app/utils/chat.ts` to read whatever your API returns. The component only needs
the text received so far and a flag that says whether more is coming.

The route stops writing when the response closes. h3 waits for the request's
`close` event by default, and Node fires that once the request body is done
rather than when the client leaves.

## Tests

`e2e/app.spec.ts` runs from the repository root against the production build
served with `npm run preview -- --port 5304`. It imports `@playwright/test` from
the root, so this app's `typecheck` leaves the `e2e` folder out.
