<script lang="ts">
  import { smoothStream } from 'smooth-stream-text/svelte'
  import { onDestroy } from 'svelte'
  import { renderMarkdown } from '#lib/markdown.ts'

  interface Props {
    text: string
    streaming: boolean
    /** Reveal the rest of this answer without pacing. */
    showAll?: boolean
    /** The answer is completely on screen. Never called for history, which starts that way. */
    ondone?: () => void
  }

  let { text, streaming, showAll = false, ondone }: Props = $props()

  // `$smooth.text` is an evenly growing prefix of `text`. A message that is already
  // finished when it first arrives, like history, is shown at once.
  const smooth = smoothStream()
  const sync = () => smooth.apply(text, !streaming)
  // Effects do not run on the server: apply once during setup as well, so the
  // server HTML of a finished message holds its full text.
  sync()
  $effect(sync)
  onDestroy(smooth.destroy)

  // flush() reveals what has arrived so far. While the answer is still arriving,
  // keep flushing, so that "Show all" also covers the text that comes after it.
  $effect(() => {
    if (showAll && $smooth.pending > 0) smooth.flush()
  })

  // History starts done, so only an answer that was drawn reports finishing.
  let drawing = $smooth.phase !== 'done'
  $effect(() => {
    if (drawing && $smooth.phase === 'done') {
      drawing = false
      ondone?.()
    }
  })
</script>

<div class="answer" data-testid="assistant-message" data-phase={$smooth.phase}>
  {@html renderMarkdown($smooth.text)}
</div>
