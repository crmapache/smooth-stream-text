// Runs against the packed tarball with the oldest framework versions the README
// promises: React 18 and Vue 3.2. A finished answer must be in the server-rendered
// HTML, which is what a chat loading its history depends on.
import assert from 'node:assert/strict'
import { createElement } from 'react'
import { renderToString } from 'react-dom/server'
import { createSSRApp, defineComponent, h } from 'vue'
import { renderToString as renderVue } from 'vue/server-renderer'
import { SmoothText, useSmoothText } from 'smooth-stream-text/react'
import { useSmoothStream } from 'smooth-stream-text/vue'

const ANSWER = 'History is already **finished**, 今天天气很好 👩‍💻.'

function Answer() {
  const { text, phase } = useSmoothText(ANSWER, { done: true })
  return createElement('p', { 'data-phase': phase }, text)
}
const react = renderToString(createElement(Answer))
assert.ok(react.includes('data-phase="done"'), react)
assert.ok(react.includes('今天天气很好'), react)
const component = renderToString(createElement(SmoothText, { text: ANSWER, done: true, as: 'p' }))
assert.ok(component.includes('今天天气很好'), component)

const app = createSSRApp(
  defineComponent({
    setup() {
      const { text, phase } = useSmoothStream(() => ANSWER, { done: true })
      return () => h('p', { 'data-phase': phase.value }, text.value)
    },
  }),
)
const vue = await renderVue(app)
assert.ok(vue.includes('data-phase="done"'), vue)
assert.ok(vue.includes('今天天气很好'), vue)

const { version: reactVersion } = (await import('react/package.json', { with: { type: 'json' } })).default
const { version: vueVersion } = (await import('vue/package.json', { with: { type: 'json' } })).default
console.log(`React ${reactVersion} and Vue ${vueVersion}: server rendering of history ok`)
