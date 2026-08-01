import { resolve } from 'node:path'
import { defineConfig } from 'vite'

// The playground is a standalone Vite app that consumes the library from source
// (aliased below), so it always previews the working tree. `vite build` emits a
// static site into playground/dist, ready to deploy on its own.
export default defineConfig({
  root: 'playground',
  resolve: {
    alias: {
      'smooth-stream-text/dom': resolve(__dirname, 'src/dom/index.ts'),
      'smooth-stream-text': resolve(__dirname, 'src/index.ts'),
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
})
