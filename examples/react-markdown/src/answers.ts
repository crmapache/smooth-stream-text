// Canned answers for the simulated stream. Each one ends with a plain sentence,
// so it is easy to see (and to test) that the tail of an answer arrived.

export const answers = [
  `## Debouncing a search box

Calling the API on every keystroke wastes requests and makes results flicker. A **debounce** waits until the user stops typing for a moment:

\`\`\`ts
function debounce<T extends unknown[]>(fn: (...args: T) => void, ms: number) {
  let timer: ReturnType<typeof setTimeout> | undefined
  return (...args: T) => {
    clearTimeout(timer)
    timer = setTimeout(() => fn(...args), ms)
  }
}
\`\`\`

| Delay | Feels like |
| --- | --- |
| 100 ms | instant, still many requests |
| 300 ms | the usual choice |
| 600 ms | sluggish |

- Cancel the previous request with an \`AbortController\`, or a slow response can overwrite a newer one.
- Show the last results while new ones load, instead of an empty list.

MDN has a good page on [AbortController](https://developer.mozilla.org/en-US/docs/Web/API/AbortController).

That is all you need to get started.`,

  `Here is the same greeting in a few scripts, which is a good test for any text that grows piece by piece 👩‍💻🇧🇷:

- Chinese: 你好，欢迎使用我们的应用。
- Japanese: こんにちは、アプリへようこそ。
- Arabic: مرحبا، أهلا بك في تطبيقنا.
- Hindi: नमस्ते, हमारे ऐप में आपका स्वागत है।

Emoji such as 👨‍👩‍👧‍👦 and 🏳️‍🌈 are several code points joined together, and a flag like 🇯🇵 is two. Cutting between them shows the wrong picture for a moment.

Every script above should appear without broken characters.`,

  `## Why a page feels slow even when the server is fast

Most of the time a slow page is not waiting on the network at all. It is waiting on the main thread. The browser has one thread that runs your JavaScript, calculates styles, lays out the page and paints it. While a long task runs on that thread, nothing else happens: clicks queue up, animations freeze and text that has already arrived is not drawn.

A useful rule is to keep every task under fifty milliseconds. That leaves room for the browser to respond to input between tasks. The Performance panel in the browser's developer tools shows long tasks as red-marked blocks, and it is usually obvious which function is responsible.

Common causes, roughly in the order you will meet them:

1. Rendering large lists in one go. Ten thousand rows are ten thousand DOM nodes. Virtualise the list so only the visible rows exist.
2. Parsing big JSON responses on the main thread. Move the work to a Web Worker, or ask the server for a smaller page of data.
3. Re-rendering more than needed. In component frameworks, a state change high in the tree can re-render everything below it. Keep fast-changing state close to where it is used.
4. Layout thrashing: reading a layout property such as offsetHeight right after writing a style forces the browser to recalculate layout immediately. Batch reads before writes.
5. Third-party scripts. Analytics and chat widgets often run more code than the page itself. Load them after the main content and measure what they cost.

Measure before changing anything. A profile recorded on a mid-range phone with CPU throttling enabled tells you more than any rule of thumb, because the device your users hold is usually slower than the one on your desk. Record the interaction that feels slow, find the longest task in it, and fix that one first. Then record again, because the second-longest task is often hidden behind the first.

Finally, remember that perceived speed matters as much as measured speed. Showing something useful early, keeping the layout stable while content loads, and responding to input straight away all make a page feel faster even when the total time is the same.

Start with the longest task and work down from there.`,
]
