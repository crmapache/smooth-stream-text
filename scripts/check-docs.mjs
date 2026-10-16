#!/usr/bin/env node
// Checks the documentation against the built package, so a recipe that imports
// something that does not exist, or a table with a stale default, fails CI instead
// of reaching a reader or a coding assistant.
//
//   npm run build && node scripts/check-docs.mjs
//
// Checked: every `import ... from 'smooth-stream-text...'` in a code block names an
// entry point that exists and only exports it has; every options table row agrees
// with defaultPacing / defaultReveal; version statements match package.json; every
// example depends on a range that includes the current version.

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'))
const problems = []
const fail = (file, message) => problems.push(`${relative(ROOT, file)}: ${message}`)

// ---------- what the package really exports ----------

const ENTRIES = Object.keys(pkg.exports).filter((key) => key !== './package.json' && !key.endsWith('.css'))
const exportsOf = new Map()
for (const key of ENTRIES) {
  const name = key === '.' ? pkg.name : `${pkg.name}/${key.slice(2)}`
  const target = pkg.exports[key].import
  const runtime = Object.keys(await import(pathToFileURL(join(ROOT, target.default)).href))
  // Type-only exports exist only in the declarations; collect them from there.
  const types = new Set()
  const collect = (file, seen = new Set()) => {
    if (seen.has(file) || !existsSync(file)) return
    seen.add(file)
    const source = readFileSync(file, 'utf8')
    for (const match of source.matchAll(/export\s+(?:declare\s+)?(?:interface|type|class|function|const)\s+(\w+)/g))
      types.add(match[1])
    for (const match of source.matchAll(/export\s+(?:type\s+)?\{([^}]*)\}(?:\s+from\s+'([^']+)')?/g)) {
      for (const part of match[1].split(',')) {
        const alias = part
          .trim()
          .replace(/^type\s+/, '')
          .split(/\s+as\s+/)
          .pop()
        if (alias) types.add(alias)
      }
    }
    for (const match of source.matchAll(/export\s+\*\s+from\s+'([^']+)'/g)) {
      const next = resolve(dirname(file), match[1].replace(/\.js$/, '') + '.d.ts')
      collect(next, seen)
    }
  }
  collect(join(ROOT, target.types))
  exportsOf.set(name, new Set([...runtime, ...types]))
}

// ---------- documentation files ----------

function files(dir, accept) {
  if (!existsSync(dir)) return []
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (name === 'node_modules' || (name.startsWith('.') && name !== '.vitepress')) return []
    return statSync(path).isDirectory() ? files(path, accept) : accept(path) ? [path] : []
  })
}

const docs = [
  join(ROOT, 'README.md'),
  join(ROOT, 'INTEGRATION.md'),
  ...files(join(ROOT, 'website'), (p) => p.endsWith('.md') && !p.includes('/.vitepress/')),
  ...files(join(ROOT, 'skills'), (p) => p.endsWith('.md')),
].filter((path) => existsSync(path))

// ---------- imports in code blocks ----------

const IMPORT =
  /import\s+(type\s+)?(?:\{([^}]*)\}|(\w+)|\*\s+as\s+\w+)?\s*(?:,\s*\{([^}]*)\})?\s*(?:from\s+)?['"](smooth-stream-text(?:\/[\w./-]+)?)['"]/g

for (const file of docs) {
  const source = readFileSync(file, 'utf8')
  for (const block of source.matchAll(/```[\w-]*\n([\s\S]*?)```/g)) {
    for (const match of block[1].matchAll(IMPORT)) {
      const entry = match[5]
      if (entry === `${pkg.name}/styles.css`) continue
      const known = exportsOf.get(entry)
      if (!known) {
        fail(file, `imports from "${entry}", which is not an entry point`)
        continue
      }
      const names = [match[2], match[4]].filter(Boolean).join(',').split(',')
      for (const raw of names) {
        const name = raw
          .trim()
          .replace(/^type\s+/, '')
          .split(/\s+as\s+/)[0]
        if (name && !known.has(name)) fail(file, `"${name}" is not exported from "${entry}"`)
      }
    }
  }
}

// ---------- options tables ----------

const { defaultPacing } = await import(pathToFileURL(join(ROOT, 'dist/index.js')).href)
const { defaultReveal } = await import(pathToFileURL(join(ROOT, 'dist/dom/index.js')).href)
const shown = (value) => (typeof value === 'string' ? value : JSON.stringify(value))

for (const file of docs) {
  const source = readFileSync(file, 'utf8')
  let section = null
  let inTable = false
  let hasDefault = false
  for (const line of source.split('\n')) {
    if (/^#+ /.test(line))
      section = /reveal/i.test(line) ? 'reveal' : /pacing|options|settings/i.test(line) ? 'pacing' : section
    // Only tables with a Default column state defaults; others (attributes, exports) are skipped.
    if (line.startsWith('|') && !inTable) hasDefault = /\|\s*default\s*\|/i.test(line)
    inTable = line.startsWith('|')
    const row = hasDefault && /^\|\s*`(\w+)`\s*\|\s*`([^`]*)`\s*\|/.exec(line)
    if (!row) continue
    const [, key, documented] = row
    const table =
      section === 'reveal' && key in defaultReveal
        ? defaultReveal
        : key in defaultPacing
          ? defaultPacing
          : key in defaultReveal
            ? defaultReveal
            : null
    if (!table || key === 'clock' || key === 'className') continue
    const actual = shown(table[key]).replace(/^"|"$/g, '')
    if (documented.replace(/^'|'$/g, '') !== actual)
      fail(file, `table says ${key} defaults to ${documented}, the package says ${actual}`)
  }
}

// ---------- versions ----------

for (const file of docs) {
  for (const match of readFileSync(file, 'utf8').matchAll(/documents version (\d+\.\d+\.\d+)/g)) {
    if (match[1] !== pkg.version) fail(file, `says it documents ${match[1]}, package.json is ${pkg.version}`)
  }
}

const [major, minor] = pkg.version.split('.').map(Number)
for (const dir of files(
  join(ROOT, 'examples'),
  (p) => p.endsWith('/package.json') && p.split('/examples/')[1].split('/').length === 2,
)) {
  const range = JSON.parse(readFileSync(dir, 'utf8')).dependencies?.[pkg.name]
  const match = /^\^(\d+)\.(\d+)\.\d+$/.exec(range ?? '')
  if (!match) fail(dir, `depends on ${pkg.name}@${range}; expected a caret range`)
  else if (Number(match[1]) !== major || (major === 0 && Number(match[2]) !== minor))
    fail(dir, `range ${range} does not include ${pkg.version}`)
}

if (!pkg.files.includes('INTEGRATION.md'))
  problems.push('package.json: INTEGRATION.md is not in "files", so it does not ship')

if (problems.length) {
  console.error(`Documentation does not match the package:\n- ${problems.join('\n- ')}`)
  process.exit(1)
}
console.log(`Docs check passed: ${docs.length} files, ${ENTRIES.length} entry points.`)
