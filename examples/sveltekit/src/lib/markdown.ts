import DOMPurify from 'isomorphic-dompurify'
import { marked } from 'marked'

/** Markdown to sanitized HTML, the same on the server and in the browser. */
export function renderMarkdown(source: string): string {
  return DOMPurify.sanitize(marked.parse(source, { async: false }))
}
