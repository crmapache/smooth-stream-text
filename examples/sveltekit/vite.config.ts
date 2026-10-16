import adapter from '@sveltejs/adapter-node'
import { sveltekit } from '@sveltejs/kit/vite'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [sveltekit({ adapter: adapter() })],
  server: { port: 5205, strictPort: true },
  preview: { port: 5205, strictPort: true },
})
