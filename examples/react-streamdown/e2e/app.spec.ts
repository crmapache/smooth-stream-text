import { test as base, expect, type Locator, type Page } from '@playwright/test'
import { answers, history } from '../src/answers.ts'

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

const assistantMessages = (page: Page) => page.getByTestId('assistant-message')

/** Sends a question and returns its answer once it is on the page. */
async function ask(page: Page): Promise<Locator> {
  const count = await assistantMessages(page).count()
  await page.getByLabel('Your question').fill('Tell me something')
  await page.getByRole('button', { name: 'Send' }).click()
  await expect(assistantMessages(page)).toHaveCount(count + 1)
  return assistantMessages(page).nth(count)
}

test.beforeEach(async ({ page }) => {
  await page.goto('/')
})

test('history is on screen at once and never animates', async ({ page }) => {
  const messages = assistantMessages(page)
  await expect(messages).toHaveCount(history.length, { timeout: 500 })
  for (const [index, turn] of history.entries()) {
    const message = messages.nth(index)
    await expect(message).toContainText(lastLine(turn.answer), { timeout: 500 })
    await expect(message).toHaveAttribute('data-phase', 'done')
    await expect(message.locator('[data-sd-animate]')).toHaveCount(0)
  }
  await expect(page.getByRole('button', { name: 'Show all' })).toHaveCount(0)
})

test('a question gets a paced answer that arrives complete', async ({ page }) => {
  const answer = await ask(page)
  await expect(page.getByRole('button', { name: 'Send' })).toBeDisabled()
  await expect(page.getByRole('button', { name: 'Stop' })).toBeEnabled()

  await expect(answer).toHaveAttribute('data-phase', 'done', { timeout: 30_000 })
  await expect(answer).toContainText(anyEnding)
  await expect(page.getByRole('status')).toHaveText('Answer complete')
  await expect(page.getByRole('button', { name: 'Show all' })).toHaveCount(0)
})

test('Show all shows the rest of the answer as it lands', async ({ page }) => {
  const answer = await ask(page)
  const showAll = page.getByRole('button', { name: 'Show all' })
  await showAll.click()
  await expect(showAll).toBeHidden()

  // Text that has not arrived cannot be shown, so wait for the transport to close.
  await expect(page.getByRole('button', { name: 'Stop' })).toBeDisabled({ timeout: 30_000 })
  await expect(answer).toHaveAttribute('data-phase', 'done', { timeout: 3_000 })
  await expect(answer).toContainText(anyEnding)
})

test('Stop closes the answer, and the next question still works', async ({ page }) => {
  const stopped = await ask(page)
  await page.waitForTimeout(300)
  await page.getByRole('button', { name: 'Stop' }).click()
  await expect(stopped).toHaveAttribute('data-phase', 'done', { timeout: 3_000 })
  await expect(stopped).not.toContainText(anyEnding)
  await expect(page.getByRole('button', { name: 'Stop' })).toBeDisabled()

  const next = await ask(page)
  await expect(next).toHaveAttribute('data-phase', 'done', { timeout: 30_000 })
  await expect(next).toContainText(anyEnding)
})

test('every canned answer arrives whole, emoji and scripts included', async ({ page }) => {
  test.setTimeout(120_000)
  for (const expected of answers) {
    const answer = await ask(page)
    await expect(answer).toHaveAttribute('data-phase', 'done', { timeout: 30_000 })
    // Lines without markdown read the same once rendered.
    for (const line of expected.split('\n').filter((line) => line && !/[`#*|[\]]|^\d+\./.test(line))) {
      await expect(answer).toContainText(line)
    }
  }
})
