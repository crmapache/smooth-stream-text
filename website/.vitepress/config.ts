import { defineConfig, type HeadConfig } from 'vitepress'
import { version } from '../../package.json'
import { DOCS, NPM, REPO, SECTIONS, SITE, TAGLINE } from './site.mjs'

/** `getting-started.md` -> `getting-started`, `index.md` -> `` */
const slug = (relativePath: string) => relativePath.replace(/(^|\/)index\.md$/, '$1').replace(/\.md$/, '')

export default defineConfig({
  title: 'smooth-stream-text',
  titleTemplate: ':title · smooth-stream-text',
  description: TAGLINE,
  lang: 'en-US',
  base: '/docs/',
  cleanUrls: true,
  outDir: '../site-dist/docs',
  srcExclude: ['**/README.md'],
  appearance: 'dark',
  lastUpdated: false,

  head: [
    ['link', { rel: 'icon', href: '/favicon.svg', type: 'image/svg+xml' }],
    ['meta', { name: 'theme-color', content: '#020504' }],
    ['meta', { property: 'og:site_name', content: 'smooth-stream-text' }],
    ['meta', { property: 'og:image', content: `${SITE}/og.png` }],
    ['meta', { name: 'twitter:card', content: 'summary_large_image' }],
    // Privacy-friendly page counts (self-hosted Umami, no cookies), production domain only.
    [
      'script',
      {
        defer: '',
        src: 'https://analytics.mzpizote.com/script.js',
        'data-website-id': '1ca1a0aa-b24c-4d45-8c2d-656c1453e435',
        'data-domains': 'smooth-stream-text.vercel.app',
        'data-do-not-track': 'true',
      },
    ],
  ],

  // Every page gets its canonical URL, its own social preview and a link to the plain
  // Markdown copy of itself, which the site build writes next to the HTML.
  transformHead({ pageData }) {
    const path = slug(pageData.relativePath)
    const url = `${DOCS}${path}`
    const title = pageData.title ? `${pageData.title} · smooth-stream-text` : 'smooth-stream-text'
    const description = pageData.description || TAGLINE
    const head: HeadConfig[] = [
      ['link', { rel: 'canonical', href: url }],
      ['link', { rel: 'alternate', type: 'text/markdown', href: `${DOCS}${path || 'index'}.md` }],
      ['meta', { property: 'og:type', content: 'article' }],
      ['meta', { property: 'og:url', content: url }],
      ['meta', { property: 'og:title', content: title }],
      ['meta', { property: 'og:description', content: description }],
    ]
    if (path === '') {
      head.push([
        'script',
        { type: 'application/ld+json' },
        JSON.stringify({
          '@context': 'https://schema.org',
          '@type': 'SoftwareSourceCode',
          name: 'smooth-stream-text',
          description: TAGLINE,
          url: DOCS,
          codeRepository: REPO,
          programmingLanguage: 'TypeScript',
          runtimePlatform: ['Browser', 'Node.js'],
          license: 'https://opensource.org/licenses/MIT',
          version,
          author: { '@type': 'Person', name: 'Maksim Zolotoi' },
        }),
      ])
    }
    return head
  },

  markdown: {
    theme: { light: 'github-light', dark: 'github-dark' },
  },

  themeConfig: {
    logo: { src: '/favicon.svg', alt: '' },
    nav: [
      { text: 'Guide', link: '/getting-started', activeMatch: '^/(getting-started|react|vue|svelte|dom)' },
      { text: 'Integrations', link: '/integrations/ai-sdk', activeMatch: '^/integrations/' },
      { text: 'API', link: '/api' },
      { text: 'Playground', link: SITE, target: '_self' },
      {
        text: `v${version}`,
        items: [
          { text: 'Changelog', link: '/changelog' },
          { text: 'npm', link: NPM },
        ],
      },
    ],
    sidebar: SECTIONS,
    socialLinks: [
      { icon: 'github', link: REPO },
      { icon: 'npm', link: NPM },
    ],
    search: { provider: 'local' },
    outline: { level: [2, 3] },
    editLink: {
      pattern: `${REPO}/edit/main/website/:path`,
      text: 'Edit this page on GitHub',
    },
    footer: {
      message: `MIT licensed. Plain-text docs for tools and assistants: <a href="${SITE}/llms.txt">llms.txt</a>, <a href="${SITE}/llms-full.txt">llms-full.txt</a>, or append <code>.md</code> to any page URL.`,
    },
  },
})
