#!/usr/bin/env node
// Builds everything https://smooth-stream-text.vercel.app serves into site-dist/:
//
//   /                 the playground (playground/, Vite)
//   /docs/            the documentation (website/, VitePress)
//   /docs/<page>.md   every docs page as plain Markdown, with code includes expanded
//   /llms.txt         an index of those Markdown pages, https://llmstxt.org
//   /llms-full.txt    the current user docs in one file
//   /sitemap.xml, /robots.txt, /404.html
//
//   node scripts/build-site.mjs

import { execFileSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { DOCS, EXAMPLES, NPM, REPO, SECTIONS, SITE, TAGLINE } from '../website/.vitepress/site.mjs'
import { expand, markdownUrl, pages } from './docs-markdown.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = join(ROOT, 'site-dist')
const { version } = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'))

const run = (command, args) => execFileSync(command, args, { cwd: ROOT, stdio: 'inherit' })

// ---------- HTML ----------

rmSync(OUT, { recursive: true, force: true })
run('npx', ['vite', 'build'])
cpSync(join(ROOT, 'playground/dist'), OUT, { recursive: true })
run('npx', ['vitepress', 'build', 'website'])
// Vercel serves /404.html for every path it does not know, inside /docs or not.
cpSync(join(OUT, 'docs/404.html'), join(OUT, '404.html'))

// ---------- Markdown copies ----------

const all = pages()
const byRoute = new Map(all.map((page) => [page.route, page]))
for (const page of all) {
  const target = join(OUT, 'docs', page.route === '/' ? 'index.md' : `${page.route.slice(1)}.md`)
  mkdirSync(dirname(target), { recursive: true })
  writeFileSync(target, expand(page))
}

// ---------- llms.txt and llms-full.txt ----------

const ordered = SECTIONS.flatMap((section) =>
  section.items.map((item) => ({ section: section.text, page: byRoute.get(item.link) })),
)
for (const { page } of ordered) if (!page) throw new Error('a sidebar link has no page')
const optional = new Set(['/changelog', '/benchmarks', '/comparisons', '/case-studies'])

const llms = [
  '# smooth-stream-text',
  '',
  `> ${TAGLINE} React, Vue, Svelte and Web Component integrations are included; a fade-in reveal is optional.`,
  '',
  `Version ${version} on npm as \`smooth-stream-text\`. Install with \`npm install smooth-stream-text\` (or the project's package manager). Entry points: \`smooth-stream-text\` (core, no DOM, Node 18+), \`smooth-stream-text/react\`, \`smooth-stream-text/vue\`, \`smooth-stream-text/svelte\`, \`smooth-stream-text/dom\`, \`smooth-stream-text/web-component\`. You pass the text received so far and whether the answer is done; it returns a prefix that grows at an even, adaptive rate, which you render with your existing renderer. Finished text (history) appears at once. It is not a transport, not a Markdown parser and not a sanitizer. Positions and rates count UTF-16 code units.`,
  '',
]
for (const section of SECTIONS) {
  const items = section.items.filter((item) => !optional.has(item.link))
  if (!items.length) continue
  llms.push(`## ${section.text}`, '')
  for (const item of items)
    llms.push(`- [${item.text}](${markdownUrl(item.link)}): ${byRoute.get(item.link).description}`)
  llms.push('')
}
llms.push('## Examples', '')
for (const example of EXAMPLES)
  llms.push(`- [${example.title}](${REPO}/tree/main/examples/${example.name}): ${example.note}`)
llms.push('', '## Optional', '')
for (const route of optional)
  llms.push(`- [${byRoute.get(route).title}](${markdownUrl(route)}): ${byRoute.get(route).description}`)
llms.push(
  `- [Source on GitHub](${REPO})`,
  `- [Package on npm](${NPM})`,
  `- [All of the docs above in one file](${SITE}/llms-full.txt)`,
  '',
)
writeFileSync(join(OUT, 'llms.txt'), llms.join('\n'))

// The full file is the current user documentation only: no release history, no benchmark tables.
const full = [
  `# smooth-stream-text ${version} documentation`,
  '',
  `> ${TAGLINE}`,
  '',
  `Source: ${DOCS}. Each section below is also available on its own at the URL given in it.`,
  '',
]
for (const { page } of ordered) if (!optional.has(page.route)) full.push('---', '', expand(page))
writeFileSync(join(OUT, 'llms-full.txt'), full.join('\n'))

// ---------- sitemap.xml and robots.txt ----------

/** The last commit that touched a file, or today for files with changes not yet committed. */
function lastModified(path) {
  const today = new Date().toISOString().slice(0, 10)
  try {
    const dirty = execFileSync('git', ['status', '--porcelain', '--', path], { cwd: ROOT, encoding: 'utf8' }).trim()
    if (dirty) return today
    return (
      execFileSync('git', ['log', '-1', '--format=%cs', '--', path], { cwd: ROOT, encoding: 'utf8' }).trim() || today
    )
  } catch {
    return today
  }
}

const urls = [
  { loc: `${SITE}/`, lastmod: lastModified(join(ROOT, 'playground/index.html')) },
  ...ordered.map(({ page }) => ({ loc: `${DOCS}${page.route.slice(1)}`, lastmod: lastModified(page.path) })),
]
writeFileSync(
  join(OUT, 'sitemap.xml'),
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls
    .map((u) => `  <url><loc>${u.loc}</loc><lastmod>${u.lastmod}</lastmod></url>`)
    .join('\n')}\n</urlset>\n`,
)

writeFileSync(
  join(OUT, 'robots.txt'),
  `# Everything here is public documentation for an open-source package.
# Search engines, AI search, assistants fetching a page for a user, and
# training crawlers are all allowed on every page.
User-agent: *
Allow: /

Sitemap: ${SITE}/sitemap.xml
`,
)

const count = readdirSync(join(OUT, 'docs'), { recursive: true }).filter((f) => String(f).endsWith('.md')).length
console.log(
  `site-dist: ${count} Markdown pages, llms.txt ${Buffer.byteLength(llms.join('\n'))} B, llms-full.txt ${Math.round(Buffer.byteLength(full.join('\n')) / 1024)} kB, ${urls.length} sitemap URLs`,
)
if (!existsSync(join(OUT, 'index.html')) || !existsSync(join(OUT, 'docs/index.html')))
  throw new Error('site-dist is missing a home page')
