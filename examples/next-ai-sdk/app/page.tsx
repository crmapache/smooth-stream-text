import { connection } from 'next/server'
import { Suspense } from 'react'
import { loadConversation } from '@/lib/history'
import { Chat } from './chat'

async function Conversation() {
  // The conversation belongs to the visitor, so it is rendered per request.
  await connection()
  const messages = await loadConversation()
  return <Chat initialMessages={messages} />
}

export default function Page() {
  return (
    <Suspense fallback={<main className="chat" />}>
      <Conversation />
    </Suspense>
  )
}
