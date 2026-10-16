import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react()],
  server: { port: 5201, strictPort: true },
  preview: { port: 5201, strictPort: true },
})
