// Asks Context7 to re-index the library after the docs changed. Context7 also refreshes
// on its own schedule, but for a small library that can take weeks.
//
//   CONTEXT7_API_KEY=ctx7sk... node scripts/context7-refresh.mjs
//
// Without a key it says so and does nothing; a refresh that keeps failing fails the job.
// "Started" is all Context7 reports: the new docs appear when its parse finishes.

const LIBRARY = '/crmapache/smooth-stream-text'
const key = process.env.CONTEXT7_API_KEY

if (!key) {
  console.log('::warning::CONTEXT7_API_KEY is not set, so Context7 was not asked to refresh.')
  process.exit(0)
}

for (let attempt = 1; attempt <= 3; attempt++) {
  const response = await fetch('https://context7.com/api/v1/refresh', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ libraryName: LIBRARY }),
  }).catch((error) => ({ ok: false, status: 0, headers: new Headers(), text: async () => String(error) }))
  const body = await response.text()
  if (response.ok) {
    console.log(`Context7 refresh of ${LIBRARY} started: ${body}`)
    process.exit(0)
  }
  console.error(`Attempt ${attempt}: HTTP ${response.status} ${body}`)
  // Client errors other than rate limits will not get better by waiting.
  if (response.status >= 400 && response.status < 500 && response.status !== 429) break
  const wait = Number(response.headers.get('retry-after')) || attempt * 30
  if (attempt < 3) await new Promise((resolve) => setTimeout(resolve, wait * 1000))
}
console.error(`::error::Context7 did not start a refresh of ${LIBRARY}. The docs there are still the previous version.`)
process.exit(1)
