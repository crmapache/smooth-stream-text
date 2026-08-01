import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node', // pure-logic tests; DOM tests opt in via `@vitest-environment jsdom`
    include: ['tests/**/*.test.{ts,tsx}'],
  },
})
