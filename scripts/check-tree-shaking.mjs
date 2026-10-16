#!/usr/bin/env node
// Checks that an app importing only the pacing hooks does not bundle the reveal.
// A bundler keeps every call at the top of a module unless it is marked pure, so a
// single unmarked `forwardRef` or `defineComponent` in a shared entry is enough to
// pull the reveal into apps that never use it, doubling what they ship.
//
//   npm run build && node scripts/check-tree-shaking.mjs
//
// Each case bundles the named imports from the built entry, the way an app's
// bundler would, and looks for a class name only the reveal uses. The controls
// import the reveal itself, so a check that can no longer see it fails too.

import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'

// WORD_CLASS in src/reveal/styles.ts. If it is renamed, the controls fail here.
const REVEAL_MARKER = 'sst-word'

const CASES = [
  { entry: 'smooth-stream-text', names: ['createSmoothStream', 'createSourceSync'], reveal: false },
  {
    entry: 'smooth-stream-text/react',
    names: ['useSmoothText', 'useSmoothStream', 'useSmoothStreamController'],
    reveal: false,
  },
  { entry: 'smooth-stream-text/vue', names: ['useSmoothStream'], reveal: false },
  { entry: 'smooth-stream-text/svelte', names: ['smoothStream'], reveal: false },
  { entry: 'smooth-stream-text/react', names: ['Reveal'], reveal: true },
  { entry: 'smooth-stream-text/vue', names: ['Reveal'], reveal: true },
  { entry: 'smooth-stream-text/svelte', names: ['reveal'], reveal: true },
]

const problems = []
for (const { entry, names, reveal } of CASES) {
  const file = fileURLToPath(import.meta.resolve(entry))
  const result = await build({
    stdin: {
      contents: `export { ${names.join(', ')} } from ${JSON.stringify(file)}`,
      resolveDir: dirname(file),
      loader: 'js',
    },
    bundle: true,
    write: false,
    format: 'esm',
    // React, Vue and Svelte belong to the app, not to this package.
    packages: 'external',
    logLevel: 'silent',
  })
  const code = result.outputFiles[0].text
  const label = `{ ${names.join(', ')} } from '${entry}'`
  if (code.includes(REVEAL_MARKER) !== reveal) {
    problems.push(reveal ? `${label} no longer contains the reveal` : `${label} bundles the reveal`)
  }
  console.log(`${code.includes(REVEAL_MARKER) === reveal ? 'ok  ' : 'FAIL'} ${label}: ${code.length} bytes`)
}

if (problems.length) {
  console.error(
    `\nTree shaking is broken:\n- ${problems.join('\n- ')}\n` +
      'Mark calls at the top of a module /* @__PURE__ */, or move them out of the shared entry.',
  )
  process.exit(1)
}
