// What the docs measure, besides page views: copying code (and install commands in
// particular) and leaving for npm or GitHub. A copied install command is not an
// install; the events only say a reader took that step.

type Umami = { track(event: string, data?: Record<string, string | number | boolean>): void }

const umami = () => (window as unknown as { umami?: Umami }).umami

export function trackDocs(): void {
  document.addEventListener('click', (event) => {
    const target = event.target as Element | null
    const copy = target?.closest?.('button.copy')
    if (copy) {
      const block = copy.closest('div[class*="language-"]')
      const lang = block?.className.match(/language-(\w+)/)?.[1] ?? ''
      const code = block?.querySelector('pre')?.textContent ?? ''
      const install = /\b(npm (i|install)|pnpm add|yarn add|bun add)\b[^\n]*smooth-stream-text/.test(code)
      umami()?.track(install ? 'copy-install' : 'copy-code', { page: location.pathname, lang })
      return
    }
    const link = target?.closest?.('a[href^="http"]') as HTMLAnchorElement | null
    if (!link || link.host === location.host) return
    const host = link.host.replace(/^www\./, '')
    if (/github\.com|npmjs\.com/.test(host)) {
      umami()?.track('outbound', { target: host.startsWith('github') ? 'github' : 'npm', page: location.pathname })
    }
  })
}
