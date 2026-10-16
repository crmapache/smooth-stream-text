import { defineConfig, devices } from '@playwright/test'

// Runs the end-to-end tests of one example app against its production build:
//   EXAMPLE=react-markdown npx playwright test
// Each example is installed and built on its own first (see .github/workflows/examples.yml).

const examples = {
  'react-markdown': { port: 5301, command: 'npm run preview -- --port 5301' },
  'next-ai-sdk': { port: 5302, command: 'PORT=5302 npm run start' },
  'react-streamdown': { port: 5303, command: 'npm run preview -- --port 5303' },
  nuxt: { port: 5304, command: 'PORT=5304 node .output/server/index.mjs' },
  sveltekit: { port: 5305, command: 'PORT=5305 node build' },
  vanilla: { port: 5306, command: 'npm run preview -- --port 5306' },
} as const

type Example = keyof typeof examples

const name = (process.env.EXAMPLE ?? 'react-markdown') as Example
const example = examples[name]
if (!example) throw new Error(`Unknown EXAMPLE "${name}". Known: ${Object.keys(examples).join(', ')}`)

export default defineConfig({
  testDir: `examples/${name}/e2e`,
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  use: {
    baseURL: `http://localhost:${example.port}`,
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: example.command,
    cwd: `examples/${name}`,
    url: `http://localhost:${example.port}`,
    reuseExistingServer: false,
    timeout: 120_000,
  },
})
