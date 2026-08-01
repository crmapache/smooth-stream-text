import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'

const root = dirname(fileURLToPath(import.meta.url))

// The playground is a standalone Vite app that consumes the library from source
// (aliased below), so it always previews the working tree. `vite build` emits a
// static site into playground/dist, ready to deploy on its own.
export default defineConfig({
  root: 'playground',
  resolve: {
    alias: {
      'smooth-stream-text/dom': resolve(root, 'src/dom/index.ts'),
      'smooth-stream-text': resolve(root, 'src/index.ts'),
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
})
