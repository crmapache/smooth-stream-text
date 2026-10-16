// Prints the CHANGELOG.md section for one version, for the GitHub release. Fails when
// there is none, so a release cannot go out without notes.
//
//   node scripts/release-notes.mjs v0.2.0
import { readFileSync } from 'node:fs'

const version = (process.argv[2] ?? '').replace(/^v/, '')
const changelog = readFileSync(new URL('../CHANGELOG.md', import.meta.url), 'utf8')
const start = changelog.search(new RegExp(`^## ${version.replace(/\./g, '\\.')}( |$)`, 'm'))
if (!version || start < 0) {
  console.error(`CHANGELOG.md has no "## ${version}" section.`)
  process.exit(1)
}
const rest = changelog.slice(start)
const end = rest.slice(3).search(/^## /m)
const section = end < 0 ? rest : rest.slice(0, end + 3)
console.log(section.split('\n').slice(1).join('\n').trim())
