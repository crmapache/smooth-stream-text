import { test as base, expect, type Locator, type Page } from '@playwright/test'
import { answers, history } from '../src/answers.js'

/** Every canned answer ends with a plain sentence on its own line. */
const lastLine = (text: string) => text.trim().split('\n').at(-1)!
const anyEnding = new RegExp(answers.map((answer) => lastLine(answer).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'))

// (e) Every test fails if the page logs a console error or throws.
const test = base.extend<{ errors: string[] }>({
  errors: [
    async ({ page }, use) => {
      const errors: string[] = []
      page.on('console', (message) => {
        if (message.type() === 'error') errors.push(message.text())
      })
      page.on('pageerror', (error) => errors.push(error.message))
      await use(errors)
      expect(errors, 'console errors and page errors').toEqual([])
    },
    { auto: true },
  ],
})

test.beforeEach(async ({ page }) => {
  await page.goto('/')
})

for (const name of ['Imperative API', 'Web Component']) {
  test.describe(name, () => {
    const panelOf = (page: Page) => page.getByRole('region', { name })
    const assistantMessages = (page: Page) => panelOf(page).getByTestId('assistant-message')
    const button = (page: Page, label: string) => panelOf(page).getByRole('button', { name: label, exact: true })

    /** Sends a question and returns its answer once it is on the page. */
    async function ask(page: Page): Promise<Locator> {
      const count = await assistantMessages(page).count()
      await panelOf(page).getByLabel('Your question').fill('Tell me something')
      await button(page, 'Send').click()
      await expect(assistantMessages(page)).toHaveCount(count + 1)
      return assistantMessages(page).nth(count)
    }

    test('history is on screen at once and never animates', async ({ page }) => {
      const messages = assistantMessages(page)
      await expect(messages).toHaveCount(history.length, { timeout: 500 })
      for (const [index, turn] of history.entries()) {
        const message = messages.nth(index)
        await expect(message).toContainText(lastLine(turn.answer), { timeout: 500 })
        expect(await message.textContent()).toBe(turn.answer)
        await expect(message).toHaveAttribute('data-phase', 'done')
        // The reveal wraps text in `.sst-word` spans only while it fades in.
        await expect(message.locator('.sst-word')).toHaveCount(0)
      }
      await expect(button(page, 'Show all')).toBeHidden()
    })

    test('a question gets a paced answer that arrives complete', async ({ page }) => {
      const answer = await ask(page)
      await expect(button(page, 'Send')).toBeDisabled()
      await expect(button(page, 'Stop')).toBeEnabled()

      await expect(answer).toHaveAttribute('data-phase', 'done', { timeout: 30_000 })
      await expect(answer).toContainText(anyEnding)
      expect(answers).toContain(await answer.textContent())
      await expect(panelOf(page).getByRole('status')).toHaveText('Answer complete')
      await expect(button(page, 'Show all')).toBeHidden()
    })

    test('Show all shows the rest of the answer as it lands', async ({ page }) => {
      const answer = await ask(page)
      const showAll = button(page, 'Show all')
      await showAll.click()
      await expect(showAll).toBeHidden()
      // flush() leaves nothing fading in.
      await expect(answer.locator('.sst-word')).toHaveCount(0)

      // Text that has not arrived cannot be shown, so wait for the transport to close.
      await expect(button(page, 'Stop')).toBeDisabled({ timeout: 30_000 })
      await expect(answer).toHaveAttribute('data-phase', 'done', { timeout: 3_000 })
      await expect(answer).toContainText(anyEnding)
    })

    test('Stop closes the answer, and the next question still works', async ({ page }) => {
      const stopped = await ask(page)
      await page.waitForTimeout(300)
      await button(page, 'Stop').click()
      await expect(stopped).toHaveAttribute('data-phase', 'done', { timeout: 3_000 })
      await expect(stopped).not.toContainText(anyEnding)
      await expect(button(page, 'Stop')).toBeDisabled()

      const next = await ask(page)
      await expect(next).toHaveAttribute('data-phase', 'done', { timeout: 30_000 })
      await expect(next).toContainText(anyEnding)
    })

    test('Clear chat removes every message and leaves nothing scheduled', async ({ page }) => {
      // Count every frame and timer the page asks for from here on.
      await page.addInitScript(() => {
        const counted = window as typeof window & { scheduled: number }
        const { requestAnimationFrame, setTimeout } = window
        counted.scheduled = 0
        window.requestAnimationFrame = (callback) => {
          counted.scheduled++
          return requestAnimationFrame.call(window, callback)
        }
        window.setTimeout = ((handler: TimerHandler, ms?: number, ...rest: unknown[]) => {
          counted.scheduled++
          return setTimeout.call(window, handler, ms, ...rest)
        }) as typeof window.setTimeout
      })
      await page.reload()

      // Clear in the middle of an answer, while frames and timers are busy.
      const answer = await ask(page)
      await expect(answer).not.toBeEmpty()
      await button(page, 'Clear chat').click()
      await expect(panelOf(page).getByRole('listitem')).toHaveCount(0)
      await expect(button(page, 'Send')).toBeEnabled()

      const scheduled = () => page.evaluate(() => (window as typeof window & { scheduled: number }).scheduled)
      await page.waitForTimeout(200)
      const settled = await scheduled()
      await page.waitForTimeout(1_000)
      expect(await scheduled()).toBe(settled)
    })

    test('every canned answer arrives whole, emoji and scripts included', async ({ page }) => {
      test.setTimeout(120_000)
      for (const expected of answers) {
        const answer = await ask(page)
        await expect(answer).toHaveAttribute('data-phase', 'done', { timeout: 30_000 })
        expect(await answer.textContent()).toBe(expected)
      }
    })
  })
}
