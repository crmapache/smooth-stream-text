import { openai } from '@ai-sdk/openai'
import type { LanguageModel } from 'ai'
import { offlineModel } from './offline-model'

/** A real model when OPENAI_API_KEY is set (server-side only), the offline one otherwise. */
export function chatModel(): LanguageModel {
  if (process.env.OPENAI_API_KEY) return openai(process.env.OPENAI_MODEL ?? 'gpt-5.4-mini')
  return offlineModel
}
