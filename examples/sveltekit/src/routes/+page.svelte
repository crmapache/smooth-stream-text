<script lang="ts">
  import { onMount } from 'svelte'
  import AssistantMessage from '#lib/AssistantMessage.svelte'
  import { streamChat } from '#lib/chat.ts'
  import '#lib/chat.css'
  import type { PageProps } from './$types'

  interface Turn {
    id: number
    question: string
    answer: string
    /** The server is still sending the answer. */
    streaming: boolean
    /** The paced answer is completely on screen. */
    settled: boolean
    /** "Show all" was pressed: the rest of the answer skips pacing. */
    showAll: boolean
  }

  let { data }: PageProps = $props()

  let turns = $state<Turn[]>([])
  let question = $state('')
  let announcement = $state('')
  let hydrated = $state(false)
  let request: AbortController | null = null

  const active = $derived(turns.at(-1))
  const streaming = $derived(active?.streaming ?? false)

  // Until the page is hydrated, Send would submit the form natively.
  onMount(() => {
    hydrated = true
  })

  async function send(event: SubmitEvent) {
    event.preventDefault()
    const text = question.trim()
    if (!text || streaming) return
    question = ''
    announcement = ''

    turns.push({ id: turns.length, question: text, answer: '', streaming: true, settled: false, showAll: false })
    const turn = turns.at(-1)!
    const controller = (request = new AbortController())

    try {
      await streamChat(text, (delta) => (turn.answer += delta), controller.signal)
    } catch (error) {
      // Stop aborts on purpose: the text received so far stays and finishes drawing.
      if (!controller.signal.aborted) console.error(error)
    } finally {
      turn.streaming = false
      request = null
    }
  }

  function stop() {
    request?.abort()
  }

  function showAll() {
    if (active) active.showAll = true
  }

  function settle(turn: Turn) {
    turn.settled = true
    announcement = 'Answer complete'
  }
</script>

<main class="chat">
  <h1>SvelteKit chat</h1>
  <p class="intro">Answers stream from a simulated model and are paced with smooth-stream-text.</p>

  <ol class="turns">
    {#each data.history as turn}
      <li class="turn">
        <p class="question">{turn.question}</p>
        <AssistantMessage text={turn.answer} streaming={false} />
      </li>
    {/each}
    {#each turns as turn (turn.id)}
      <li class="turn">
        <p class="question">{turn.question}</p>
        <AssistantMessage
          text={turn.answer}
          streaming={turn.streaming}
          showAll={turn.showAll}
          ondone={() => settle(turn)} />
      </li>
    {/each}
  </ol>

  <form class="composer" onsubmit={send}>
    <label for="question">Your question</label>
    <input id="question" bind:value={question} autocomplete="off" />
    <div class="actions">
      <button type="submit" class="primary" disabled={!hydrated || streaming}>Send</button>
      <button type="button" disabled={!streaming} onclick={stop}>Stop</button>
      {#if active && !active.settled && !active.showAll}
        <button type="button" class="show-all" onclick={showAll}>Show all</button>
      {/if}
    </div>
  </form>

  <p class="visually-hidden" aria-live="polite">{announcement}</p>
</main>
