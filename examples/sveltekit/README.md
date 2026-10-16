# SvelteKit

A chat page rendered on the server with SvelteKit and Svelte 5 runes. Each
answer is paced with the `smoothStream` store from `smooth-stream-text/svelte`
and rendered as markdown with `marked` and `isomorphic-dompurify`. A server
route streams canned answers, so there is no API key to set up.

Verified with smooth-stream-text 0.2.0, SvelteKit 3.1.0, Svelte 5.57.2,
@sveltejs/adapter-node 6.0.0, Vite 8.3.4, marked 18.1.1, isomorphic-dompurify
4.5.0 and TypeScript 6.0.3 on Node 24.22. isomorphic-dompurify 4 needs Node
22.22.2 or 24.15 and newer.

```sh
npm install
npm run dev
```

The page opens on http://localhost:5205. `npm run build` and then
`npm run preview` serve the production build on the same port. Add
`-- --port 5305` to use another one.

## Where to look

`src/lib/AssistantMessage.svelte` is the whole integration. Each assistant
message creates its own store and hands it the text on every change:

```svelte
const smooth = smoothStream()
const sync = () => smooth.apply(text, !streaming)
sync()
$effect(sync)
onDestroy(smooth.destroy)
```

It then renders `$smooth.text` as markdown and puts `$smooth.phase` on the
element as `data-phase`.

The direct `sync()` call matters for server rendering. Effects do not run on
the server, and a message that is already done when the store first sees it is
shown at once. Calling `apply` during setup is what puts the two history turns
from `src/routes/+page.server.ts` into the HTML complete. In the browser they
do not replay either.

`src/routes/+page.svelte` owns the conversation. `src/lib/chat.ts` posts the
question, reads the event stream with `fetch` and a reader, and calls back with
every delta. The page appends each delta to the message and sets `streaming` to
false when the stream ends or Stop aborts the request. The store then draws
what is left within about a second.

"Show all" calls `flush`, which shows everything received so far. Text that
arrives later would be paced again, so after the click the component keeps
flushing on every new chunk until the answer ends.

When the phase becomes `done`, the component calls `ondone` and the page
announces "Answer complete" in a polite live region. The answer itself is not a
live region, so a screen reader does not read it as it grows.

For plain text, the `smoothText` action from the same entry paces and animates
the text in one element. Actions do not run on the server, so an element with
the action is empty in the server HTML.

## Using your own transport

Nothing here talks to a model. `src/routes/api/chat/+server.ts` picks the next
string from `src/lib/server/answers.ts`, and `src/lib/server/simulate.ts` cuts
it into chunks of uneven size with uneven delays, the way a model streams. To
use a real model, forward its deltas from that route as `data: {"delta":"..."}`
events, or change `src/lib/chat.ts` to read whatever your API returns. The
component only needs the text received so far and a flag that says whether
more is coming.

## Tests

`e2e/app.spec.ts` runs from the repository root against the production build
served with `npm run preview -- --port 5305`. It imports `@playwright/test`
from the root, and the app's `typecheck` only covers `src`.
