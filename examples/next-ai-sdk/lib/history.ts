import type { UIMessage } from 'ai'

// A conversation that already happened. In a real app it comes from your database.
export async function loadConversation(): Promise<UIMessage[]> {
  return [
    {
      id: 'history-1',
      role: 'user',
      parts: [{ type: 'text', text: 'Should I use `===` or `==` in JavaScript?' }],
    },
    {
      id: 'history-2',
      role: 'assistant',
      parts: [
        {
          type: 'text',
          state: 'done',
          text: `Use \`===\` almost everywhere. It compares without converting types, so \`0 === ''\` is \`false\`, while \`0 == ''\` is \`true\`.

The one common exception is \`value == null\`, which is a short way to check for both \`null\` and \`undefined\`.

Most linters can enforce this with a single rule.`,
        },
      ],
    },
  ]
}
