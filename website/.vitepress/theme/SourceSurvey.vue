<script setup lang="ts">
import { onMounted, ref } from 'vue'

// One optional question, answered at most once per browser: how the reader found the
// package. Referrers miss most of this, assistants especially, which rarely send one.

const KEY = 'sst-found-via'
const SOURCES = [
  { id: 'ai', label: 'An AI assistant' },
  { id: 'search', label: 'A search engine' },
  { id: 'github', label: 'GitHub' },
  { id: 'npm', label: 'npm' },
  { id: 'people', label: 'A person or a post' },
  { id: 'other', label: 'Somewhere else' },
]
const ASSISTANTS = ['ChatGPT', 'Claude', 'Gemini', 'Copilot', 'Cursor', 'Another one']

const state = ref<'ask' | 'which' | 'done' | 'hidden'>('hidden')

onMounted(() => {
  state.value = localStorage.getItem(KEY) ? 'hidden' : 'ask'
})

function send(source: string, assistant?: string) {
  const umami = (window as unknown as { umami?: { track(e: string, d: Record<string, string>): void } }).umami
  umami?.track('found-via', assistant ? { source, assistant } : { source })
  localStorage.setItem(KEY, source)
  state.value = 'done'
}

function choose(source: string) {
  if (source === 'ai') state.value = 'which'
  else send(source)
}
</script>

<template>
  <aside v-if="state !== 'hidden'" class="survey" aria-live="polite">
    <template v-if="state === 'ask'">
      <p>How did you find smooth-stream-text? One click, anonymous, optional.</p>
      <div class="options">
        <button v-for="s in SOURCES" :key="s.id" type="button" @click="choose(s.id)">{{ s.label }}</button>
      </div>
    </template>
    <template v-else-if="state === 'which'">
      <p>Which assistant?</p>
      <div class="options">
        <button v-for="a in ASSISTANTS" :key="a" type="button" @click="send('ai', a)">{{ a }}</button>
      </div>
    </template>
    <p v-else>Thank you.</p>
  </aside>
</template>

<style scoped>
.survey {
  margin-top: 40px;
  padding: 16px 20px;
  border: 1px solid var(--vp-c-divider);
  border-radius: 12px;
  background: var(--vp-c-bg-soft);
}

.survey p {
  margin: 0 0 12px;
  font-size: 14px;
  color: var(--vp-c-text-2);
}

.survey p:last-child {
  margin-bottom: 0;
}

.options {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

button {
  padding: 6px 12px;
  border: 1px solid var(--vp-c-divider);
  border-radius: 8px;
  background: var(--vp-c-bg);
  color: var(--vp-c-text-1);
  font-size: 14px;
  transition:
    border-color 0.2s,
    background-color 0.2s,
    color 0.2s;
}

button:hover {
  border-color: var(--vp-c-brand-3);
  color: var(--vp-c-brand-1);
}

button:active {
  background: var(--vp-c-brand-soft);
  transition-duration: 0.05s;
}

button:focus-visible {
  outline: 2px solid var(--vp-c-brand-1);
  outline-offset: 2px;
}
</style>
