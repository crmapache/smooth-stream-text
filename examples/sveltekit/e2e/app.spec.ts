import { expect, test, type Locator, type Page } from '@playwright/test'
import { answers, history } from '../src/lib/server/answers.ts'

/** Every canned answer ends with a plain sentence on a line of its own. */
const lastLine = (text: string) => text.trim().split('\n').at(-1)!
const endings = answers.map(lastLine)

let errors: string[] = []

test.beforeEach(({ page }) => {
  errors = []
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text())
  })
  page.on('pageerror', (error) => errors.push(error.message))
})

test.afterEach(() => {
  expect(errors, 'console errors and page errors').toEqual([])
})

const messages = (page: Page) => page.getByTestId('assistant-message')

/** Sends a question and returns the assistant message that answers it. */
async function ask(page: Page, question: string): Promise<Locator> {
  const send = page.getByRole('button', { name: 'Send' })
  // Send is enabled once the page is hydrated and no answer is streaming.
  await expect(send).toBeEnabled()
  const count = await messages(page).count()
  await page.getByLabel('Your question').fill(question)
  await send.click()
  await expect(messages(page)).toHaveCount(count + 1)
  return messages(page).last()
}

async function expectComplete(message: Locator, timeout: number) {
  await expect(message).toHaveAttribute('data-phase', 'done', { timeout })
  const text = await message.innerText()
  expect(
    endings.some((ending) => text.includes(ending)),
    `the answer ends with one of the canned sentences: ...${text.slice(-120)}`,
  ).toBe(true)
}

test('the server HTML already holds the finished history', async ({ request }) => {
  const response = await request.get('/')
  expect(response.ok()).toBe(true)
  const html = await response.text()

  for (const turn of history) expect(html).toContain(`<p>${lastLine(turn.answer)}</p>`)
  expect(html.match(/data-phase="done"/g)).toHaveLength(history.length)
})

test('history appears at once and a new answer is paced to its end', async ({ page }) => {
  await page.goto('/')
  await expect(messages(page)).toHaveCount(history.length)
  for (const message of await messages(page).all()) await expect(message).toHaveAttribute('data-phase', 'done')

  const answer = await ask(page, 'How should I cache static assets?')
  await expectComplete(answer, 30_000)
})

test('Show all skips the pacing for the rest of the answer', async ({ page }) => {
  await page.goto('/')
  const answer = await ask(page, 'How do I test with real text?')

  const showAll = page.getByRole('button', { name: 'Show all' })
  await showAll.click()
  await expect(showAll).toBeHidden()

  // Show all cannot hurry the server, which may still be sending. Once it stops,
  // nothing is left to draw.
  await expect(page.getByRole('button', { name: 'Send' })).toBeEnabled({ timeout: 30_000 })
  await expectComplete(answer, 3_000)
})

test('Stop finishes the answer and the next question still works', async ({ page }) => {
  await page.goto('/')
  const stopped = await ask(page, 'How do I build an accessible form?')

  await page.waitForTimeout(300)
  await page.getByRole('button', { name: 'Stop' }).click()
  await expect(stopped).toHaveAttribute('data-phase', 'done', { timeout: 3_000 })

  const next = await ask(page, 'And how do I cache static assets?')
  await expectComplete(next, 30_000)
})
