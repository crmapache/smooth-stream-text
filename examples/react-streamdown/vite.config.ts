import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Fixed ports, so this example can run next to the others. The e2e suite
  // serves the production build on the preview port.
  server: { port: 5203, strictPort: true },
  preview: { port: 5303, strictPort: true },
})
