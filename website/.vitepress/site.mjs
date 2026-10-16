// Facts about the site that the VitePress config, the site build and the
// machine-readable outputs all need. One place, so they cannot drift apart.
// Plain JavaScript, so the Node build script can import it without a compiler.

export const SITE = 'https://smooth-stream-text.vercel.app'
export const DOCS = `${SITE}/docs/`
export const REPO = 'https://github.com/crmapache/smooth-stream-text'
export const NPM = 'https://www.npmjs.com/package/smooth-stream-text'

export const TAGLINE =
  'Adaptive text-stream smoothing for AI chat interfaces. Keep your Markdown renderer and pace incoming text with a zero-dependency headless core.'

/** The sidebar, in reading order. Also the order of llms.txt and llms-full.txt. */
export const SECTIONS = [
  {
    text: 'Introduction',
    items: [
      { text: 'What it does', link: '/' },
      { text: 'Getting started', link: '/getting-started' },
    ],
  },
  {
    text: 'Frameworks',
    items: [
      { text: 'React', link: '/react' },
      { text: 'Vue and Nuxt', link: '/vue' },
      { text: 'Svelte and SvelteKit', link: '/svelte' },
      { text: 'Plain JavaScript and Web Component', link: '/dom' },
    ],
  },
  {
    text: 'Integrations',
    items: [
      { text: 'AI SDK', link: '/integrations/ai-sdk' },
      { text: 'Next.js', link: '/integrations/nextjs' },
      { text: 'Streamdown', link: '/integrations/streamdown' },
    ],
  },
  {
    text: 'Concepts',
    items: [
      { text: 'Latency and completion', link: '/concepts/latency' },
      { text: 'Text boundaries', link: '/concepts/text-boundaries' },
      { text: 'Accessibility', link: '/accessibility' },
    ],
  },
  {
    text: 'Reference',
    items: [
      { text: 'API', link: '/api' },
      { text: 'Choosing an approach', link: '/comparisons' },
      { text: 'Benchmarks', link: '/benchmarks' },
      { text: 'Case studies', link: '/case-studies' },
      { text: 'Changelog', link: '/changelog' },
    ],
  },
]

/** Runnable apps in examples/, for llms.txt and the docs. */
export const EXAMPLES = [
  {
    name: 'react-markdown',
    title: 'React with react-markdown',
    note: 'Vite app, simulated stream, history, Stop and Show all.',
  },
  {
    name: 'next-ai-sdk',
    title: 'Next.js with the AI SDK',
    note: 'useChat, a route handler, tool calls, server-rendered history.',
  },
  {
    name: 'react-streamdown',
    title: 'React with Streamdown',
    note: 'Pacing in front of Streamdown, which keeps the animation.',
  },
  { name: 'nuxt', title: 'Nuxt', note: 'useSmoothStream with server-rendered history.' },
  { name: 'sveltekit', title: 'SvelteKit', note: 'The smoothStream store with server-rendered history.' },
  {
    name: 'vanilla',
    title: 'Plain JavaScript and Web Component',
    note: 'createSmoothText and <smooth-stream-text> side by side.',
  },
]
