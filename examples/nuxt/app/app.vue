<script setup lang="ts">
import AssistantMessage from '~/components/AssistantMessage.vue'
import { streamChat } from '~/utils/chat'

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

const { data: history } = await useFetch('/api/history', { default: () => [] })

const turns = ref<Turn[]>([])
const question = ref('')
const announcement = ref('')
const hydrated = ref(false)
let request: AbortController | null = null

const active = computed(() => turns.value.at(-1))
const streaming = computed(() => active.value?.streaming ?? false)

// Until the page is hydrated, Send would submit the form natively.
onMounted(() => {
  hydrated.value = true
})

async function send() {
  const text = question.value.trim()
  if (!text || streaming.value) return
  question.value = ''
  announcement.value = ''

  turns.value.push({
    id: turns.value.length,
    question: text,
    answer: '',
    streaming: true,
    settled: false,
    showAll: false,
  })
  const turn = turns.value.at(-1)!
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
  if (active.value) active.value.showAll = true
}

function settle(turn: Turn) {
  turn.settled = true
  announcement.value = 'Answer complete'
}
</script>

<template>
  <main class="chat">
    <h1>Nuxt chat</h1>
    <p class="intro">Answers stream from a simulated model and are paced with smooth-stream-text.</p>

    <ol class="turns">
      <li v-for="(turn, index) in history" :key="`history-${index}`" class="turn">
        <p class="question">{{ turn.question }}</p>
        <AssistantMessage :text="turn.answer" :streaming="false" />
      </li>
      <li v-for="turn in turns" :key="`live-${turn.id}`" class="turn">
        <p class="question">{{ turn.question }}</p>
        <AssistantMessage
          :text="turn.answer"
          :streaming="turn.streaming"
          :show-all="turn.showAll"
          @done="settle(turn)" />
      </li>
    </ol>

    <form class="composer" @submit.prevent="send">
      <label for="question">Your question</label>
      <input id="question" v-model="question" autocomplete="off" />
      <div class="actions">
        <button type="submit" class="primary" :disabled="!hydrated || streaming">Send</button>
        <button type="button" :disabled="!streaming" @click="stop">Stop</button>
        <button v-if="active && !active.settled && !active.showAll" type="button" class="show-all" @click="showAll">
          Show all
        </button>
      </div>
    </form>

    <p class="visually-hidden" aria-live="polite">{{ announcement }}</p>
  </main>
</template>
