import { readFile, writeFile } from 'node:fs/promises'
import { defineConfig } from 'tsup'
import { REVEAL_CSS } from './src/reveal/styles'

/** Next.js treats a module as a client boundary only when its file starts with this. */
const CLIENT_DIRECTIVE = "'use client';\n"

// Source maps are deliberately off. They were two thirds of the published tarball
// for a small library, and the output is unminified and readable as it is.
// Anyone who wants them can build the repository, which is where the playground
// consumes the sources directly anyway.
export default defineConfig({
  // One build for every entry, so the ES modules share a single copy of the core:
  // an app importing both the root and a framework entry gets it once. Every
  // entry also ships CommonJS for the CJS-mode test runners and older toolchains.
  entry: {
    index: 'src/index.ts',
    'dom/index': 'src/dom/index.ts',
    'react/index': 'src/react/index.ts',
    'vue/index': 'src/vue/index.ts',
    'svelte/index': 'src/svelte/index.ts',
    'web-component/index': 'src/web-component/index.ts',
  },
  format: ['esm', 'cjs'],
  dts: true,
  clean: true,
  sourcemap: false,
  // Rollup, which tsup runs for this, warns that the Vue entry's CommonJS build
  // has named and default exports together. That is expected: the default
  // export has been there since 0.1, and CommonJS consumers get both, the
  // default as `.default`. Removing it to silence the warning would break them.
  treeshake: true,
  target: 'es2020',
  // Framework runtimes stay (peer) dependencies of the consumer, never bundled in.
  external: ['react', 'react/jsx-runtime', 'vue'],
  esbuildOptions(options) {
    options.jsx = 'automatic'
  },
  async onSuccess() {
    // Only the React entry is a client boundary: the core must stay importable
    // from server code.
    for (const file of ['dist/react/index.js', 'dist/react/index.cjs']) {
      const code = await readFile(file, 'utf8')
      if (!code.startsWith(CLIENT_DIRECTIVE)) await writeFile(file, CLIENT_DIRECTIVE + code)
    }
    // The same rules the reveal injects, for `injectStyles: false` and your own pipeline.
    await writeFile('dist/styles.css', REVEAL_CSS)
  },
})
