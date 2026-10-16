// The documentation as plain Markdown: every page of website/ with its code includes
// expanded and its links pointing at the Markdown copies. Used by the site build
// (/docs/<page>.md, llms.txt) and by the skill's references, so both say the same.

import { readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { DOCS } from '../website/.vitepress/site.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const WEBSITE = join(ROOT, 'website')
export const { version } = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'))

/** Every docs page: its route, its source file and its frontmatter. */
export function pages() {
  const found = []
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name)
      if (name.startsWith('.') || name === 'README.md') continue
      if (statSync(path).isDirectory()) walk(path)
      else if (name.endsWith('.md')) {
        const file = relative(WEBSITE, path)
        const route = '/' + file.replace(/(^|\/)index\.md$/, '$1').replace(/\.md$/, '')
        found.push({ route, file, path, ...frontmatter(readFileSync(path, 'utf8')) })
      }
    }
  }
  walk(WEBSITE)
  return found
}

function frontmatter(source) {
  const match = /^---\n([\s\S]*?)\n---\n/.exec(source)
  const data = {}
  if (match)
    for (const line of match[1].split('\n')) {
      const [key, ...rest] = line.split(':')
      if (key && rest.length) data[key.trim()] = rest.join(':').trim()
    }
  return {
    title: data.title ?? '',
    description: data.description ?? '',
    body: match ? source.slice(match[0].length) : source,
  }
}

const LANG = { ts: 'ts', tsx: 'tsx', js: 'js', mjs: 'js', vue: 'vue', svelte: 'svelte', css: 'css', json: 'json' }

/** The lines between `#region name` and `#endregion name`, dedented, as VitePress does. */
function region(code, name) {
  const lines = code.split('\n')
  const start = lines.findIndex((line) => new RegExp(`#region ${name}\\b`).test(line))
  const end = lines.findIndex((line, i) => i > start && new RegExp(`#endregion ${name}\\b`).test(line))
  if (start < 0 || end < 0) throw new Error(`region "${name}" not found`)
  const body = lines.slice(start + 1, end)
  const indent = Math.min(...body.filter((l) => l.trim()).map((l) => l.match(/^ */)[0].length))
  return body.map((l) => l.slice(indent)).join('\n')
}

/** `/react#show-all` -> absolute URL of the Markdown copy, so a reader stays in Markdown. */
export const markdownUrl = (route, hash = '') => `${DOCS}${route === '/' ? 'index' : route.slice(1)}.md${hash}`

export function expand(page) {
  // VitePress-only containers (`::: v-pre` keeps Svelte's `{{ }}` away from Vue) mean nothing in plain Markdown.
  let body = page.body.replace(/^::: ?v-pre\n|^:::\n/gm, '').replace(/^<SourceSurvey \/>\n?/gm, '')
  body = body.replace(/^<!--@include: (.+?)-->$/gm, (_, file) =>
    readFileSync(resolve(dirname(page.path), file), 'utf8').trim(),
  )
  body = body.replace(/^<<< @\/(.+?)(?:#([\w-]+))?(?:\{[^}]*\})?\s*$/gm, (_, file, name) => {
    const path = resolve(WEBSITE, file)
    const code = readFileSync(path, 'utf8')
    const lang = LANG[path.split('.').pop()] ?? ''
    const shown = (name ? region(code, name) : code).replace(/^\s*\/\/ #(end)?region.*\n/gm, '').trimEnd()
    return `\`${relative(ROOT, path)}\`${name ? ` (excerpt)` : ''}:\n\n\`\`\`\`${lang}\n${shown}\n\`\`\`\``
  })
  // Internal links point at the Markdown copies; external links stay as they are.
  body = body.replace(
    /\]\((\/[^)\s#]*)(#[^)\s]*)?\)/g,
    (_, route, hash) => `](${markdownUrl(route.replace(/\/$/, '') || '/', hash ?? '')})`,
  )
  const html = `${DOCS}${page.route.slice(1)}`
  const header = `> ${page.description}\n>\n> smooth-stream-text ${version}. HTML version: ${html}`
  // The header goes under the page's own H1.
  return body.trim().replace(/^(# .+)$/m, `$1\n\n${header}`) + '\n'
}
