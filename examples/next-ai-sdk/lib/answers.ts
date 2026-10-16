// Canned answers for the offline model. Each ends with a plain sentence, so it is easy
// to see (and to test) that the tail of an answer arrived.

export const answers = [
  `## Choosing a cache lifetime

A \`Cache-Control\` header tells browsers and CDNs how long a response stays fresh:

\`\`\`http
Cache-Control: public, max-age=31536000, immutable
\`\`\`

| Resource | Typical header |
| --- | --- |
| Hashed JS and CSS | \`max-age=31536000, immutable\` |
| HTML | \`no-cache\` |
| API responses | \`private, max-age=0\` |

- Files with a content hash in their name can be cached for a year, because a new build gets a new name.
- HTML should be revalidated on every request, so users pick up the new build.

MDN explains every directive on its [Cache-Control page](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Cache-Control).

That is all you need to get started.`,

  `Text that grows piece by piece has to survive every script 👩‍💻🇧🇷:

- Chinese: 我们的服务今天运行正常。
- Japanese: 本日のサービスは正常に稼働しています。
- Arabic: خدمتنا تعمل بشكل طبيعي اليوم.
- Hindi: हमारी सेवा आज सामान्य रूप से चल रही है।

Joined emoji such as 👨‍👩‍👧 and flags such as 🇵🇹 are several code points that must appear together.

Every script above should appear without broken characters.`,

  `## Keeping a form usable while it submits

When a form takes a second or two to submit, people click the button again, edit fields that are already on their way to the server, or leave because nothing seems to happen. A few small habits remove most of that friction.

First, show that something is happening. Disable the submit button and change its label to describe the action in progress, such as "Saving". Keep the button the same size so the layout does not jump. If the request can take longer than a couple of seconds, add a short note that explains what is going on.

Second, keep what the user typed. If the request fails, do not clear the form. Show the error next to the field it belongs to when the server says which one is wrong, and at the top of the form when it does not. Move focus to the first error so keyboard and screen reader users find it.

Third, protect against double submission on the server as well as in the browser. A disabled button does not stop a retry from a flaky connection. An idempotency key sent with the request lets the server recognise a repeat and return the first result instead of creating a second order.

Fourth, think about what happens after success. Redirect after a POST so that reloading the page does not submit the form again, and show a clear confirmation with a way to continue.

Finally, test the slow path on purpose. Throttle the network in the browser's developer tools, submit the form, and try to break it by clicking, typing and navigating while the request is in flight. Most problems show up within a minute of doing this.

Handle the slow path first and the fast path will take care of itself.`,
]

export const weatherAnswer = (city: string, temperature: number, conditions: string) =>
  `It is ${temperature} °C and ${conditions} in ${city} right now.

- A light jacket is enough for the evening.
- There is no rain in the forecast for the next few hours.

Enjoy your day in ${city}.`
