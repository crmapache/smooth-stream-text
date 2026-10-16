# Next.js + AI SDK

A Next.js App Router chat built on the AI SDK's `useChat`, with answers rendered by
react-markdown and paced in the browser by smooth-stream-text.

Verified with smooth-stream-text 0.2.0, Next.js 16.4.2, `ai` 7.0.142,
`@ai-sdk/react` 4.0.146 and React 19.3.0.

```sh
npm install
npm run dev
```

The page opens on http://localhost:5202. Without an API key the route answers with
an offline model that streams canned answers with realistic, uneven timing. To use
OpenAI instead, set `OPENAI_API_KEY` (and optionally `OPENAI_MODEL`) in
`.env.local`. The key is read only on the server.

## Where to look

`app/assistant-message.tsx` holds the integration. An AI SDK message is a list of
parts: text, tool calls and others. The component lays the text parts end to end
and paces that one string with `useSmoothText`, so the whole message moves with a
single cursor. A tool part appears once the text before it is on screen. Each text
part is rendered from its own slice of the paced string.

`app/chat.tsx` decides what is still streaming. Only the newest assistant message
can be, and only while `status` is `submitted` or `streaming`. Every message above
it is history. When the stream ends, fails or is stopped, `done` becomes true and
the paced text drains to the end within about a second.

The server route in `app/api/chat/route.ts` does not use the AI SDK's
`smoothStream()` transform. Smoothing twice adds both delays together, so this
example paces once, in the browser, where it can adapt to whatever actually
arrives.

`app/page.tsx` loads the conversation on the server. It is rendered per request
(`connection()` inside `Suspense`), because a conversation belongs to one visitor.
The finished messages are in the server HTML, and `useSmoothText` shows a message
that is already done on its first render without replaying it.

## Tests

`e2e/app.spec.ts` runs against the production build from the repository root:

```sh
npm run build
EXAMPLE=next-ai-sdk npx playwright test
```
