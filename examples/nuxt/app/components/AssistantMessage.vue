<script setup lang="ts">
import { useSmoothStream } from 'smooth-stream-text/vue'
import { renderMarkdown } from '~/utils/markdown'

const props = defineProps<{
  text: string
  streaming: boolean
  /** Reveal the rest of this answer without pacing. */
  showAll?: boolean
}>()

const emit = defineEmits<{
  /** The answer is completely on screen. Never emitted for history, which starts that way. */
  done: []
}>()

// `text` is an evenly growing prefix of `props.text`. A message that is already
// finished on its first render, like history, is shown at once, also on the server.
const { text, phase, state, flush } = useSmoothStream(() => props.text, { done: () => !props.streaming })
const html = computed(() => renderMarkdown(text.value))

// flush() reveals what has arrived so far. While the answer is still arriving,
// keep flushing, so that "Show all" also covers the text that comes after it.
watchEffect(() => {
  if (props.showAll && state.value.pending > 0) flush()
})

watch(phase, (next) => {
  if (next === 'done') emit('done')
})
</script>

<template>
  <div class="answer" data-testid="assistant-message" :data-phase="phase" v-html="html" />
</template>
