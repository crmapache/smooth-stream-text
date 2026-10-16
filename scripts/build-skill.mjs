#!/usr/bin/env node
// Writes skills/smooth-stream-text/references/ from the docs pages, so the skill and
// the site never disagree. With --check it only reports whether the committed copies
// are current, for CI.
//
//   node scripts/build-skill.mjs [--check]

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expand, pages } from './docs-markdown.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = join(ROOT, 'skills/smooth-stream-text/references')
const check = process.argv.includes('--check')

const REFERENCES = {
  'react.md': '/react',
  'ai-sdk.md': '/integrations/ai-sdk',
  'nextjs.md': '/integrations/nextjs',
  'streamdown.md': '/integrations/streamdown',
  'vue.md': '/vue',
  'svelte.md': '/svelte',
  'dom.md': '/dom',
  'api.md': '/api',
  'latency.md': '/concepts/latency',
}

const byRoute = new Map(pages().map((page) => [page.route, page]))
const stale = []
mkdirSync(OUT, { recursive: true })
for (const [file, route] of Object.entries(REFERENCES)) {
  const page = byRoute.get(route)
  if (!page) throw new Error(`no docs page for ${route}`)
  const content = `<!-- Generated from website/${page.file} by scripts/build-skill.mjs. Edit the docs page, not this file. -->\n\n${expand(page)}`
  const target = join(OUT, file)
  if (check) {
    if (!existsSync(target) || readFileSync(target, 'utf8') !== content) stale.push(file)
  } else writeFileSync(target, content)
}

if (stale.length) {
  console.error(`Skill references are out of date: ${stale.join(', ')}. Run node scripts/build-skill.mjs.`)
  process.exit(1)
}
console.log(check ? 'Skill references are current.' : `Wrote ${Object.keys(REFERENCES).length} skill references.`)
