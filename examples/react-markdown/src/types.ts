export interface Message {
  id: string
  role: 'user' | 'assistant'
  /** Everything received so far. */
  text: string
  /** True until the transport closes the answer. */
  streaming: boolean
}
