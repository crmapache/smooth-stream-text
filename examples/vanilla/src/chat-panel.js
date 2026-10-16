import { answers, questions } from './answers.js'
import { stickToBottom } from './stick-to-bottom.js'

/**
 * The parts of a panel that do not depend on how the answer is drawn: the
 * message list, the form and its buttons, the live region and which canned
 * answer comes next.
 *
 * @param {HTMLElement} section
 */
export function createChatPanel(section) {
  const scroller = section.querySelector('.scroller')
  const list = section.querySelector('.messages')
  const form = section.querySelector('form')
  const input = form.elements.namedItem('question')
  const status = section.querySelector('[role="status"]')
  const buttons = {
    send: form.querySelector('[type="submit"]'),
    stop: form.elements.namedItem('stop'),
    showAll: form.elements.namedItem('show-all'),
    clear: form.elements.namedItem('clear'),
  }
  let turn = 0
  input.value = questions[0]
  stickToBottom(scroller, list)

  return {
    list,
    form,
    input,
    buttons,

    /** The canned answer for this question; the input gets the next suggestion. */
    nextAnswer() {
      const answer = answers[turn % answers.length]
      turn += 1
      input.value = questions[turn % questions.length]
      return answer
    },

    /**
     * Appends a message and returns the element that holds its text: a new
     * `<div>` for a string, or the element given.
     *
     * @param {'user' | 'assistant'} role
     * @param {string | HTMLElement} content
     */
    addMessage(role, content) {
      const item = document.createElement('li')
      item.className = `message ${role}`
      const who = document.createElement('p')
      who.className = 'who'
      who.textContent = role === 'user' ? 'You' : 'Assistant'

      const body = typeof content === 'string' ? document.createElement('div') : content
      if (typeof content === 'string') body.textContent = content
      body.classList.add('text')
      if (role === 'assistant') body.dataset.testid = 'assistant-message'

      item.append(who, body)
      // A new question brings the reader back to the end of the conversation.
      if (role === 'user') scroller.scrollTop = scroller.scrollHeight
      list.append(item)
      return body
    },

    /** Read out by screen readers; the streaming text itself is not a live region. */
    announce(text) {
      status.textContent = text
    },
  }
}
