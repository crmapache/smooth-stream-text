// Registers <smooth-stream-text>.
import 'smooth-stream-text/web-component'
import { history } from './answers.js'
import { createChatPanel } from './chat-panel.js'
import { simulateStream } from './simulated-stream.js'

/** @param {HTMLElement} section */
export function mountWebComponentPanel(section) {
  const panel = createChatPanel(section)
  const { buttons } = panel
  /** The newest answer: its element, and whether Show all was pressed for it. */
  let current = null
  /** The open transport, while there is one. */
  let transport = null

  for (const turn of history) {
    panel.addMessage('user', turn.question)
    // The same as <smooth-stream-text text="..." done> in HTML. Both are set
    // before the element joins the page, so it shows the text at once.
    const element = document.createElement('smooth-stream-text')
    element.setAttribute('text', turn.answer)
    element.setAttribute('done', '')
    element.dataset.phase = 'done'
    panel.addMessage('assistant', element)
  }

  function updateButtons() {
    buttons.send.disabled = transport !== null || !panel.input.value.trim()
    buttons.stop.disabled = transport === null
    buttons.showAll.hidden = !current || current.showAll || current.element.dataset.phase === 'done'
  }

  panel.form.addEventListener('submit', async (event) => {
    event.preventDefault()
    const question = panel.input.value.trim()
    if (!question || transport) return

    const answer = panel.nextAnswer()
    panel.addMessage('user', question)
    const element = document.createElement('smooth-stream-text')
    const active = { element, showAll: false }
    current = active

    // The element reports no phase changes, only `sst:done`, once per answer
    // when its last character has finished fading in.
    element.dataset.phase = 'streaming'
    element.addEventListener('sst:done', () => {
      element.dataset.phase = 'done'
      panel.announce('Answer complete')
      updateButtons()
    })
    panel.addMessage('assistant', element)
    panel.announce('')

    const controller = new AbortController()
    transport = controller
    updateButtons()
    try {
      for await (const chunk of simulateStream(answer, { signal: controller.signal })) {
        element.push(chunk)
        // After Show all, the rest of this answer is shown as it lands.
        if (active.showAll) element.flush()
      }
    } finally {
      // Finished, stopped or failed: close the answer, and the paced tail drains.
      element.end()
      if (transport === controller) transport = null
      updateButtons()
    }
  })

  panel.input.addEventListener('input', updateButtons)

  buttons.stop.addEventListener('click', () => transport?.abort())

  buttons.showAll.addEventListener('click', () => {
    if (!current) return
    current.showAll = true
    current.element.flush()
    updateButtons()
  })

  buttons.clear.addEventListener('click', () => {
    transport?.abort()
    // Nothing to release by hand: an element taken out of the page pauses
    // itself, and one that never comes back is simply garbage collected.
    current = null
    panel.list.replaceChildren()
    panel.announce('')
    updateButtons()
  })

  updateButtons()
}
