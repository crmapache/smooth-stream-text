/**
 * A deliberately small markdown parser.
 *
 * The package ships no markdown support on purpose, so the playground has to do
 * what a real consumer does: parse the smoothed string itself and hang the reveal
 * on its own pieces. Handling only what the sample uses keeps that honest and
 * keeps the repository dependency-free.
 */

export type InlineTag = 'text' | 'strong' | 'em' | 'code' | 'link'

export interface Inline {
  tag: InlineTag
  text: string
  href?: string
}

export type Block =
  | { kind: 'heading'; level: number; inline: Inline[] }
  | { kind: 'paragraph'; inline: Inline[] }
  | { kind: 'list'; items: Inline[][] }
  | { kind: 'code'; lang: string; text: string; open: boolean }
  | { kind: 'table'; rows: Inline[][][] }

const FENCE = /^ {0,3}(?:```|~~~)\s*(\w*)\s*$/
const HEADING = /^ {0,3}(#{1,6})\s+(.*)$/
const BULLET = /^ {0,3}[-*+]\s+(.*)$/
const TABLE_ROW = /^\s*\|(.*)\|?\s*$/
const TABLE_DIVIDER = /^\s*\|?[\s:|-]+\|?\s*$/

/** Splits one line of text into inline runs. Unclosed markers stay literal, as any parser would leave them. */
export function parseInline(source: string): Inline[] {
  const parts: Inline[] = []
  let plain = ''

  const flush = () => {
    if (plain) parts.push({ tag: 'text', text: plain })
    plain = ''
  }

  let at = 0
  while (at < source.length) {
    const rest = source.slice(at)

    const strong = /^\*\*([^*]+)\*\*/.exec(rest) ?? /^__([^_]+)__/.exec(rest)
    if (strong) {
      flush()
      parts.push({ tag: 'strong', text: strong[1] })
      at += strong[0].length
      continue
    }

    const code = /^`([^`]+)`/.exec(rest)
    if (code) {
      flush()
      parts.push({ tag: 'code', text: code[1] })
      at += code[0].length
      continue
    }

    const link = /^\[([^\]]*)\]\(([^)\s]*)\)/.exec(rest)
    if (link) {
      flush()
      parts.push({ tag: 'link', text: link[1], href: link[2] })
      at += link[0].length
      continue
    }

    const em = /^\*([^*\s][^*]*)\*/.exec(rest) ?? /^_([^_\s][^_]*)_/.exec(rest)
    if (em) {
      flush()
      parts.push({ tag: 'em', text: em[1] })
      at += em[0].length
      continue
    }

    plain += source[at]
    at++
  }

  flush()
  return parts
}

const cells = (row: string) =>
  row
    .replace(/^\s*\|/, '')
    .replace(/\|\s*$/, '')
    .split('|')
    .map((cell) => parseInline(cell.trim()))

export function parseMarkdown(source: string): Block[] {
  const lines = source.split('\n')
  const blocks: Block[] = []
  let at = 0

  while (at < lines.length) {
    const line = lines[at]

    if (!line.trim()) {
      at++
      continue
    }

    const fence = FENCE.exec(line)
    if (fence) {
      const body: string[] = []
      at++
      let closed = false
      while (at < lines.length) {
        if (FENCE.test(lines[at])) {
          closed = true
          at++
          break
        }
        body.push(lines[at])
        at++
      }
      // An unclosed fence is still a code block - that is what makes the block
      // appear the moment it opens, with its body streaming in.
      blocks.push({ kind: 'code', lang: fence[1], text: body.join('\n'), open: !closed })
      continue
    }

    const heading = HEADING.exec(line)
    if (heading) {
      blocks.push({ kind: 'heading', level: heading[1].length, inline: parseInline(heading[2]) })
      at++
      continue
    }

    if (BULLET.test(line)) {
      const items: Inline[][] = []
      while (at < lines.length) {
        const bullet = BULLET.exec(lines[at])
        if (bullet) {
          items.push(parseInline(bullet[1]))
          at++
          continue
        }
        // A wrapped continuation line belongs to the item above it.
        if (items.length && /^\s+\S/.test(lines[at])) {
          const tail = parseInline(' ' + lines[at].trim())
          items[items.length - 1] = [...items[items.length - 1], ...tail]
          at++
          continue
        }
        break
      }
      blocks.push({ kind: 'list', items })
      continue
    }

    if (TABLE_ROW.test(line)) {
      const rows: Inline[][][] = []
      while (at < lines.length && TABLE_ROW.test(lines[at])) {
        if (!TABLE_DIVIDER.test(lines[at])) rows.push(cells(lines[at]))
        at++
      }
      blocks.push({ kind: 'table', rows })
      continue
    }

    const paragraph: string[] = []
    while (
      at < lines.length &&
      lines[at].trim() &&
      !HEADING.test(lines[at]) &&
      !BULLET.test(lines[at]) &&
      !FENCE.test(lines[at]) &&
      !TABLE_ROW.test(lines[at])
    ) {
      paragraph.push(lines[at].trim())
      at++
    }
    blocks.push({ kind: 'paragraph', inline: parseInline(paragraph.join(' ')) })
  }

  return blocks
}
