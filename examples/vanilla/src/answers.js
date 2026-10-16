/** Two finished turns each panel opens with. They are history and must never animate. */
export const history = [
  {
    question: 'What does a CDN actually do?',
    answer: `A CDN keeps copies of your files on servers around the world and answers each request from the one closest to the visitor. Shorter distance means lower latency, and your own server handles far less traffic.
It also absorbs traffic spikes and can terminate TLS at the edge.

That covers the basics of a CDN.`,
  },
  {
    question: 'Should font sizes be in rem or px?',
    answer: `Use rem for font sizes. A rem follows the text size the reader picked in their browser settings, while px ignores it, so rem keeps your text readable for people who need it larger.
Borders and hairlines can stay in px.

Use rem for type and you will rarely regret it.`,
  },
]

const prose = `Caching static files comes down to two rules.

Files with a content hash in their name, like app.3f9c2b.js, can be cached for a year. When the content changes, the name changes with it, so the browser never serves a stale copy.
The HTML page that points at those files should be checked again on every visit, so it always links to the newest hashes.

In practice that means Cache-Control: public, max-age=31536000, immutable for hashed assets, and Cache-Control: no-cache for index.html.
ETag and stale-while-revalidate are worth reading about next.

That is all you need to get started with caching.`

const multilingual = `Building for many languages 🌍 starts with Unicode everywhere: UTF-8 in your HTML, your database and your API.

Here is one sentence in Chinese, Japanese, Arabic and Hindi, the kind of text a 👩‍💻 on your team should test with:
网页应该让每个人都能轻松阅读。
ウェブページは誰にとっても読みやすいものであるべきです。
يجب أن تكون صفحات الويب سهلة القراءة للجميع.
वेब पेज सभी के लिए पढ़ने में आसान होने चाहिए।

Set lang on the page, let dir="auto" handle right-to-left text, and test forms with real names, like a user in São Paulo 🇧🇷 typing her own.

Good software speaks every language its users do.`

const long = `Here is what happens between pressing Enter and seeing a page.

First the browser works out where to go. It checks its own cache, then the operating system, then asks a DNS resolver to turn the host name into an IP address. With a warm cache this costs nothing; a cold lookup can take a few dozen milliseconds.

Next comes the connection. The browser opens a TCP connection, or a QUIC one for HTTP/3, and negotiates TLS so that everything after this point is encrypted. Newer protocols fold these round trips together, which is why HTTP/3 often feels quicker on mobile networks.

Then the request goes out: a GET for the page, with headers describing the browser, the languages it prefers, the cookies it holds and the encodings it accepts. The server, or a CDN edge close to the user, sends back a status code, headers and the HTML.

The browser does not wait for the whole document. It parses HTML as it streams in and builds the DOM node by node. When it meets a stylesheet it fetches it and builds the CSSOM; when it meets a classic script without async or defer, it stops parsing until that script has downloaded and run. That pause is why script placement matters so much.

A preload scanner runs ahead of the parser and starts fetching the images, fonts and scripts it can see coming, so the network stays busy even while the parser is blocked.

Once the DOM and CSSOM are ready, the browser combines them into a render tree that holds only what will be visible. Layout works out the size and position of every box, paint fills in the pixels for each layer, and the compositor assembles the layers on the GPU and puts them on screen.

None of this happens just once. Changing a class can trigger style recalculation and layout again, while animating transform or opacity usually touches only the compositor. That is why those two properties are the cheap ones to animate.

JavaScript runs on the same main thread as layout and paint. A long task blocks input, so a click can feel ignored. Breaking work into smaller pieces, moving heavy work to a worker and yielding back to the browser keep the page responsive.

Finally, the browser keeps measuring. Largest Contentful Paint records when the main content appeared, Interaction to Next Paint how quickly the page answered input, and Cumulative Layout Shift how much things jumped around. Together they summarize how the whole trip felt to a real person.

That is the whole journey from typing a URL to seeing the page.`

/** One canned answer per question, in turn. Each ends with a plain sentence of its own. */
export const answers = [prose, multilingual, long]

/** Suggested questions, one for each answer above. */
export const questions = [
  'How should I cache static files?',
  'How do I make a site work in many languages?',
  'What happens when I open a web page?',
]
