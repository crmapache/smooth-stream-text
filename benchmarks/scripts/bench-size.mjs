#!/usr/bin/env node
// Bundle cost of each public entry point, as an app would pay it: bundled and
// minified with esbuild, framework peers left out, then gzip and brotli.
//
//   node scripts/bench-size.mjs

import { build } from 'esbuild'
import { readFileSync, writeFileSync } from 'node:fs'
import { brotliCompressSync, gzipSync } from 'node:zlib'

const CASES = [
  ['core: createSmoothStream', "export { createSmoothStream } from 'smooth-stream-text'"],
  ['react: useSmoothText', "export { useSmoothText } from 'smooth-stream-text/react'"],
  ['react: SmoothText', "export { SmoothText } from 'smooth-stream-text/react'"],
  ['react: everything', "export * from 'smooth-stream-text/react'"],
  ['dom: createSmoothText', "export { createSmoothText } from 'smooth-stream-text/dom'"],
  ['vue: useSmoothStream', "export { useSmoothStream } from 'smooth-stream-text/vue'"],
  ['svelte: smoothStream', "export { smoothStream } from 'smooth-stream-text/svelte'"],
  ['web-component', "import 'smooth-stream-text/web-component'"],
]

const results = []
for (const [name, contents] of CASES) {
  const out = await build({
    stdin: { contents, resolveDir: new URL('..', import.meta.url).pathname, loader: 'js' },
    bundle: true,
    format: 'esm',
    minify: true,
    write: false,
    external: ['react', 'react/jsx-runtime', 'react-dom', 'vue', 'svelte'],
    target: 'es2020',
  })
  const code = out.outputFiles[0].contents
  results.push({
    name,
    minBytes: code.length,
    gzipBytes: gzipSync(code, { level: 9 }).length,
    brotliBytes: brotliCompressSync(code).length,
  })
}

const meta = {
  date: new Date().toISOString().slice(0, 10),
  version: JSON.parse(readFileSync(new URL('../node_modules/smooth-stream-text/package.json', import.meta.url), 'utf8'))
    .version,
  bundler: `esbuild ${(await import('esbuild')).version}, minified, ESM, target es2020, react/vue/svelte external`,
}
writeFileSync(new URL('../results/size.json', import.meta.url), JSON.stringify({ meta, results }, null, 1) + '\n')
for (const r of results) console.log(r.name.padEnd(28), r.minBytes, r.gzipBytes, r.brotliBytes)
