// Runs against the packed tarball, installed into an empty project: what users get.
// No DOM and no framework here - the core must work on its own, and browser-only
// entries must still import without throwing on a server.
import assert from 'node:assert/strict'
import { createManualClock, createSmoothStream } from 'smooth-stream-text'

const clock = createManualClock(0)
const stream = createSmoothStream({ clock })
stream.push('Hello brave new world, 今天天气很好。')
stream.end()
for (let i = 0; i < 200; i++) clock.advance(16)
assert.equal(stream.getState().text, 'Hello brave new world, 今天天气很好。')
assert.equal(stream.getState().phase, 'done')

const webComponent = await import('smooth-stream-text/web-component')
assert.equal(typeof webComponent.defineSmoothStreamTextElement, 'function')
const dom = await import('smooth-stream-text/dom')
assert.equal(typeof dom.createReveal, 'function')

console.log(`ESM ok on Node ${process.version}`)
