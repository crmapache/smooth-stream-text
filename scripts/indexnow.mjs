// Tells IndexNow (Bing, Yandex, Naver, Seznam and others share it) which URLs changed.
// A 200 or 202 means the notice was accepted, not that anything was indexed.
//
//   node scripts/changed-docs-urls.mjs v0.2.0 | node scripts/indexnow.mjs
import { SITE } from '../website/.vitepress/site.mjs'

// The key is public by design: IndexNow checks that /<key>.txt contains it.
const KEY = 'bde8af17f7b5fd844cea17b7a119c929'

let input = ''
for await (const chunk of process.stdin) input += chunk
const urlList = input
  .split('\n')
  .map((line) => line.trim())
  .filter(Boolean)
if (!urlList.length) {
  console.log('Nothing changed; no notice sent.')
  process.exit(0)
}

const body = JSON.stringify({ host: new URL(SITE).host, key: KEY, keyLocation: `${SITE}/${KEY}.txt`, urlList })
for (let attempt = 1; attempt <= 3; attempt++) {
  const response = await fetch('https://api.indexnow.org/indexnow', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body,
  }).catch((error) => ({ ok: false, status: 0, statusText: String(error) }))
  if (response.status === 200 || response.status === 202) {
    console.log(`IndexNow accepted ${urlList.length} URLs (HTTP ${response.status}).`)
    process.exit(0)
  }
  console.error(`Attempt ${attempt}: HTTP ${response.status} ${response.statusText}`)
  if (attempt < 3) await new Promise((resolve) => setTimeout(resolve, attempt * 5000))
}
console.error('IndexNow did not accept the notice after 3 attempts. Nothing was submitted.')
process.exit(1)
