// Lists the public URLs whose content changed between two commits: docs pages whose
// source changed, pages that include a changed example file, and the playground.
// Used to tell search engines what to recrawl after a deploy, so it leaves out the
// Markdown copies of the pages: they are served with noindex and are there for
// assistants, not for search.
//
//   node scripts/changed-docs-urls.mjs <from-ref> [to-ref]
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { dirname, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { pages } from './docs-markdown.mjs'
import { DOCS, SITE } from '../website/.vitepress/site.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const [from, to = 'HEAD'] = process.argv.slice(2)
if (!from) throw new Error('usage: changed-docs-urls.mjs <from-ref> [to-ref]')

const changed = new Set(
  execFileSync('git', ['diff', '--name-only', from, to], { cwd: ROOT, encoding: 'utf8' }).split('\n').filter(Boolean),
)
const urls = new Set()
for (const page of pages()) {
  const source = relative(ROOT, page.path)
  const includes = [...readFileSync(page.path, 'utf8').matchAll(/^<<< @\/(.+?)(?:#[\w-]+)?(?:\{[^}]*\})?\s*$/gm)].map(
    (m) => relative(ROOT, resolve(ROOT, 'website', m[1])),
  )
  if (page.route === '/changelog' && changed.has('CHANGELOG.md')) includes.push('CHANGELOG.md')
  if (page.route === '/benchmarks') includes.push('benchmarks/results/summary.md')
  if ([source, ...includes].some((file) => changed.has(file))) {
    urls.add(`${DOCS}${page.route.slice(1)}`)
  }
}
if ([...changed].some((file) => file.startsWith('playground/'))) urls.add(`${SITE}/`)
if (urls.size) urls.add(`${SITE}/llms.txt`)
console.log([...urls].join('\n'))
