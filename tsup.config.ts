import { defineConfig } from 'tsup'

export default defineConfig([
  {
    // The root entry is the pacing core: pure logic, so it also has to work in
    // Node, which is why it is the only entry that ships CJS.
    entry: ['src/index.ts'],
    format: ['esm', 'cjs'],
    dts: true,
    clean: true,
    sourcemap: true,
    treeshake: true,
    target: 'es2020',
  },
  {
    // Browser and framework entries ship ESM-only: their consumers are always
    // bundler-based (Vite/webpack/Rollup), so there is no CJS-only user to serve.
    entry: {
      'dom/index': 'src/dom/index.ts',
      'react/index': 'src/react/index.ts',
      'vue/index': 'src/vue/index.ts',
      'svelte/index': 'src/svelte/index.ts',
      'web-component/index': 'src/web-component/index.ts',
    },
    format: ['esm'],
    dts: true,
    sourcemap: true,
    treeshake: true,
    target: 'es2020',
    // Framework runtimes stay (peer) dependencies of the consumer, never bundled in.
    external: ['react', 'react/jsx-runtime', 'vue'],
    esbuildOptions(options) {
      options.jsx = 'automatic'
    },
  },
])
