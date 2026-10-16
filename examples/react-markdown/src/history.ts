import type { Message } from './types'

// A conversation that is already finished when the page opens. These messages are
// passed with `streaming: false`, so they appear at once instead of replaying.
export const history: Message[] = [
  {
    id: 'h1',
    role: 'user',
    text: 'What is the difference between `let` and `const`?',
    streaming: false,
  },
  {
    id: 'h2',
    role: 'assistant',
    text: `Both are block-scoped. The difference is reassignment:

- \`const\` binds a name once. Assigning to it again throws a \`TypeError\`.
- \`let\` can be reassigned.

\`const\` does **not** make a value immutable. An object declared with \`const\` can still change its properties; only the binding is fixed.

A common habit is to use \`const\` by default and switch to \`let\` when a variable really needs to change.`,
    streaming: false,
  },
]
