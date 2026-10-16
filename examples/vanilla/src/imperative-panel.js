import { createSmoothText } from 'smooth-stream-text/dom'
import { history } from './answers.js'
import { createChatPanel } from './chat-panel.js'
import { simulateStream } from './simulated-stream.js'

/** @param {HTMLElement} section */
export function mountImperativePanel(section) {
  const panel = createChatPanel(section)
  const { buttons } = panel
  /** Every handle on screen, so that Clear chat can release them. */
  const handles = new Set()
  /** The newest answer: its handle, and whether Show all was pressed for it. */
  let current = null
  /** The open transport, while there is one. */
  let transport = null

  for (const turn of history) {
    panel.addMessage('user', turn.question)
    // Finished text needs no handle: plain text is all a handle leaves on
    // screen once an answer is done.
    const body = panel.addMessage('assistant', turn.answer)
    body.dataset.phase = 'done'
  }

  function updateButtons() {
    buttons.send.disabled = transport !== null || !panel.input.value.trim()
    buttons.stop.disabled = transport === null
    buttons.showAll.hidden = !current || current.showAll || current.handle.state.phase === 'done'
  }

  panel.form.addEventListener('submit', async (event) => {
    event.preventDefault()
    const question = panel.input.value.trim()
    if (!question || transport) return

    const answer = panel.nextAnswer()
    panel.addMessage('user', question)
    const body = panel.addMessage('assistant', '')
    // The handle owns `body` from here on: it paces what is pushed and fades it in.
    const handle = createSmoothText(body)
    const active = { handle, showAll: false }
    handles.add(handle)
    current = active

    body.dataset.phase = handle.state.phase
    handle.subscribe(({ phase }) => {
      if (body.dataset.phase === phase) return
      body.dataset.phase = phase
      updateButtons()
    })
    // Once per answer, when its last character has finished fading in.
    handle.onSettled(() => panel.announce('Answer complete'))
    panel.announce('')

    const controller = new AbortController()
    transport = controller
    updateButtons()
    try {
      for await (const chunk of simulateStream(answer, { signal: controller.signal })) {
        handle.push(chunk)
        // After Show all, the rest of this answer is shown as it lands.
        if (active.showAll) handle.flush()
      }
    } finally {
      // Finished, stopped or failed: close the answer, and the paced tail drains.
      handle.end()
      if (transport === controller) transport = null
      updateButtons()
    }
  })

  panel.input.addEventListener('input', updateButtons)

  buttons.stop.addEventListener('click', () => transport?.abort())

  buttons.showAll.addEventListener('click', () => {
    if (!current) return
    current.showAll = true
    current.handle.flush()
    updateButtons()
  })

  buttons.clear.addEventListener('click', () => {
    transport?.abort()
    // The elements are going away, so their handles go too: destroy() stops
    // every frame and timer they had scheduled.
    for (const handle of handles) handle.destroy()
    handles.clear()
    current = null
    panel.list.replaceChildren()
    panel.announce('')
    updateButtons()
  })

  updateButtons()
}
