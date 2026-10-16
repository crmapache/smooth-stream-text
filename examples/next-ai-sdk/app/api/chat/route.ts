import { convertToModelMessages, createUIMessageStreamResponse, stepCountIs, streamText, toUIMessageStream, type UIMessage } from 'ai'
import { chatModel } from '@/lib/model'
import { tools } from '@/lib/tools'

export const maxDuration = 30

export async function POST(request: Request) {
  const { messages }: { messages: UIMessage[] } = await request.json()

  // No smoothStream() transform here: pacing happens once, in the browser.
  // Two smoothing layers would add their delays together.
  const result = streamText({
    model: chatModel(),
    instructions: 'You are a helpful assistant for web developers. Answer in Markdown.',
    messages: await convertToModelMessages(messages),
    tools,
    stopWhen: stepCountIs(3),
    abortSignal: request.signal,
  })

  return createUIMessageStreamResponse({ stream: toUIMessageStream({ stream: result.stream }) })
}
