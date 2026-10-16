import { defineConfig } from 'vite'

export default defineConfig({
  // Fixed ports, so this example can run next to the others. The e2e suite
  // serves the production build on the preview port.
  server: { port: 5206, strictPort: true },
  preview: { port: 5306, strictPort: true },
})
