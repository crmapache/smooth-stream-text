// The CommonJS half of the tarball check; see smoke.mjs.
const assert = require('node:assert/strict')
const { createManualClock, createSmoothStream } = require('smooth-stream-text')

const clock = createManualClock(0)
const stream = createSmoothStream({ clock })
stream.push('works from require too')
stream.end()
for (let i = 0; i < 200; i++) clock.advance(16)
assert.equal(stream.getState().text, 'works from require too')
assert.equal(typeof require('smooth-stream-text/web-component').SmoothStreamTextElement, 'function')

console.log(`CJS ok on Node ${process.version}`)
