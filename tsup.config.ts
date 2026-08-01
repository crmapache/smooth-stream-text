import { defineConfig } from 'tsup'

// Source maps are deliberately off. They were two thirds of the published tarball
// for a 2.7 kB library, and the output is small, unminified and readable as it is.
// Anyone who wants them can build the repository, which is where the playground
// consumes the sources directly anyway.
export default defineConfig([
  {
    // The root entry is the pacing core: pure logic, so it also has to work in
    // Node, which is why it is the only entry that ships CJS.
    entry: ['src/index.ts'],
    format: ['esm', 'cjs'],
    dts: true,
    clean: true,
    sourcemap: false,
    treeshake: true,
    target: 'es2020',
  },
  {
    // Browser and framework entries are overwhelmingly consumed through a bundler,
    // but shipping CJS as well costs a couple of kilobytes and saves the CJS-mode
    // test runners and older toolchains from a dynamic-import workaround.
    entry: {
      'dom/index': 'src/dom/index.ts',
      'react/index': 'src/react/index.ts',
      'vue/index': 'src/vue/index.ts',
      'svelte/index': 'src/svelte/index.ts',
      'web-component/index': 'src/web-component/index.ts',
    },
    format: ['esm', 'cjs'],
    dts: true,
    sourcemap: false,
    treeshake: true,
    target: 'es2020',
    // Framework runtimes stay (peer) dependencies of the consumer, never bundled in.
    external: ['react', 'react/jsx-runtime', 'vue'],
    esbuildOptions(options) {
      options.jsx = 'automatic'
    },
  },
])
