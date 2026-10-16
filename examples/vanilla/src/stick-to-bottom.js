/**
 * Keeps a scrolling message list on its newest line while the reader is at the
 * bottom, as chat apps do. Scrolling up to reread stops it; scrolling back down
 * resumes it. Returns a function that stops it for good.
 *
 * @param {HTMLElement} scroller
 * @param {HTMLElement} content
 */
export function stickToBottom(scroller, content) {
  scroller.scrollTop = scroller.scrollHeight
  let height = scroller.scrollHeight
  const observer = new ResizeObserver(() => {
    const atBottom = scroller.scrollTop + scroller.clientHeight >= height - 48
    height = scroller.scrollHeight
    if (atBottom) scroller.scrollTop = height
  })
  observer.observe(content)
  return () => observer.disconnect()
}
