import { createReveal, type RevealHandle, type RevealOptions, type WaveTimeline } from 'smooth-stream-text/dom'
import type { Block, Inline, InlineTag } from './markdown'

interface Part {
  tag: InlineTag
  href?: string
  node: HTMLElement
  reveal: RevealHandle | null
}

interface Slot {
  kind: Block['kind']
  signature: string
  node: HTMLElement
  /** Inline runs, flattened across list items and table cells in document order. */
  parts: Part[]
  /** The containers those runs live in, in the same order as the runs they hold. */
  hosts: HTMLElement[]
}

export interface RenderOptions {
  /** With no reveal this is a plain markdown renderer - the control side of the comparison. */
  reveal: boolean
  revealOptions?: RevealOptions
  timeline?: WaveTimeline
}

const ELEMENT: Record<InlineTag, string> = {
  text: 'span',
  strong: 'strong',
  em: 'em',
  code: 'code',
  link: 'a',
}

/**
 * Renders parsed markdown and keeps it patched in place.
 *
 * This is the integration the package is actually for: the consumer owns the
 * parsing and the markup, and the wave is applied to the text runs it produces.
 * Every run shares one timeline, so the stagger stays continuous across
 * paragraphs, list items and table cells.
 */
export function createBlockRenderer(host: HTMLElement, options: RenderOptions) {
  let slots: Slot[] = []

  function makePart(inline: Inline, container: HTMLElement): Part {
    const node = document.createElement(ELEMENT[inline.tag])
    if (inline.tag === 'link' && inline.href) {
      const anchor = node as HTMLAnchorElement
      anchor.href = inline.href
      anchor.rel = 'noreferrer'
    }
    container.appendChild(node)

    if (!options.reveal) {
      node.textContent = inline.text
      return { tag: inline.tag, href: inline.href, node, reveal: null }
    }

    // This element was created for text that is genuinely new, so it must animate
    // rather than seed - which is exactly what `initialText: ''` asks for.
    const reveal = createReveal(node, { ...options.revealOptions, timeline: options.timeline, initialText: '' })
    reveal.update(inline.text)
    return { tag: inline.tag, href: inline.href, node, reveal }
  }

  function patchRuns(slot: Slot, runs: Inline[], hosts: HTMLElement[]): void {
    for (let i = 0; i < runs.length; i++) {
      const existing = slot.parts[i]
      const wanted = runs[i]
      const sameShape = existing && existing.tag === wanted.tag && existing.href === wanted.href && slot.hosts[i] === hosts[i]

      if (sameShape) {
        if (existing.reveal) existing.reveal.update(wanted.text)
        else existing.node.textContent = wanted.text
        continue
      }

      // Shape changed here, so everything from this point is rebuilt. During a
      // smoothed stream this only ever happens at the very end of the text.
      for (const stale of slot.parts.slice(i)) {
        stale.reveal?.destroy()
        stale.node.remove()
      }
      slot.parts.length = i
      slot.hosts.length = i

      for (let k = i; k < runs.length; k++) {
        slot.parts.push(makePart(runs[k], hosts[k]))
        slot.hosts.push(hosts[k])
      }
      return
    }

    for (const stale of slot.parts.slice(runs.length)) {
      stale.reveal?.destroy()
      stale.node.remove()
    }
    slot.parts.length = runs.length
    slot.hosts.length = runs.length
  }

  /**
   * What must match for a block to be patched rather than rebuilt.
   *
   * Deliberately excludes how many list items or table rows a block has: a growing
   * count is the normal case while streaming, and rebuilding on it would destroy
   * and replay every item already on screen each time a new one arrived.
   */
  function signatureOf(block: Block): string {
    return block.kind === 'heading' ? `h${block.level}` : block.kind
  }

  function build(block: Block): Slot {
    const signature = signatureOf(block)

    if (block.kind === 'code') {
      const pre = document.createElement('pre')
      const code = document.createElement('code')
      if (block.lang) code.dataset.lang = block.lang
      pre.appendChild(code)
      return { kind: 'code', signature, node: pre, parts: [], hosts: [] }
    }

    if (block.kind === 'list') {
      return { kind: 'list', signature, node: document.createElement('ul'), parts: [], hosts: [] }
    }

    if (block.kind === 'table') {
      const table = document.createElement('table')
      table.appendChild(document.createElement('tbody'))
      return { kind: 'table', signature, node: table, parts: [], hosts: [] }
    }

    const node = document.createElement(block.kind === 'heading' ? `h${block.level}` : 'p')
    return { kind: block.kind, signature, node, parts: [], hosts: [] }
  }

  /** Grows or trims a container's children to `count`, reusing what is already there. */
  function fit(container: Element, count: number, tag: string): HTMLElement[] {
    while (container.children.length > count) container.lastElementChild!.remove()
    while (container.children.length < count) container.appendChild(document.createElement(tag))
    return [...container.children] as HTMLElement[]
  }

  /** The inline runs of a block, paired with the container each one belongs in. */
  function layout(block: Block, slot: Slot): { runs: Inline[]; hosts: HTMLElement[] } {
    if (block.kind === 'code') {
      const code = slot.node.firstElementChild as HTMLElement
      return { runs: [{ tag: 'text', text: block.text }], hosts: [code] }
    }

    const runs: Inline[] = []
    const hosts: HTMLElement[] = []

    if (block.kind === 'list') {
      const items = fit(slot.node, block.items.length, 'li')
      block.items.forEach((item, index) => {
        for (const run of item) {
          runs.push(run)
          hosts.push(items[index])
        }
      })
      return { runs, hosts }
    }

    if (block.kind === 'table') {
      const body = slot.node.firstElementChild!
      const rows = fit(body, block.rows.length, 'tr')
      block.rows.forEach((row, r) => {
        // The first row is the header, so its cells are a different element.
        const cellTag = r === 0 ? 'th' : 'td'
        if (rows[r].firstElementChild && rows[r].firstElementChild!.tagName.toLowerCase() !== cellTag) {
          rows[r].textContent = ''
        }
        const cellNodes = fit(rows[r], row.length, cellTag)
        row.forEach((cell, c) => {
          for (const run of cell) {
            runs.push(run)
            hosts.push(cellNodes[c])
          }
        })
      })
      return { runs, hosts }
    }

    return { runs: block.inline, hosts: block.inline.map(() => slot.node) }
  }

  function destroySlot(slot: Slot): void {
    for (const part of slot.parts) part.reveal?.destroy()
    slot.node.remove()
  }

  return {
    update(blocks: Block[]): void {
      for (let i = 0; i < blocks.length; i++) {
        const block = blocks[i]
        const signature = signatureOf(block)
        let slot = slots[i]

        if (!slot || slot.kind !== block.kind || slot.signature !== signature) {
          if (slot) destroySlot(slot)
          slot = build(block)
          slots[i] = slot
          const next = slots[i + 1]
          host.insertBefore(slot.node, next ? next.node : null)
        }

        const { runs, hosts } = layout(block, slot)
        patchRuns(slot, runs, hosts)
      }

      for (const stale of slots.slice(blocks.length)) destroySlot(stale)
      slots.length = blocks.length
    },

    /** Applies live control changes to every run already on screen. */
    setRevealOptions(next: Partial<RevealOptions>): void {
      Object.assign(options.revealOptions ?? {}, next)
      for (const slot of slots) {
        for (const part of slot.parts) part.reveal?.setOptions(next)
      }
    },

    reset(): void {
      for (const slot of slots) destroySlot(slot)
      slots = []
      host.textContent = ''
    },
  }
}
