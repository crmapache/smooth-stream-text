import { expect, test, type Page } from '@playwright/test'
import { answers } from '../src/answers'

const endings = answers.map((answer) => answer.trim().split('\n').pop()!)

function failOnErrors(page: Page) {
  const errors: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text())
  })
  page.on('pageerror', (error) => errors.push(error.message))
  return errors
}

async function ask(page: Page, question: string) {
  await page.getByLabel('Your question').fill(question)
  await page.getByRole('button', { name: 'Send' }).click()
  return page.getByTestId('assistant-message').last()
}

async function expectAnEnding(answer: ReturnType<Page['getByTestId']>) {
  const text = await answer.innerText()
  expect(endings.some((ending) => text.includes(ending))).toBe(true)
}

test('history is on screen at once and does not replay', async ({ page }) => {
  const errors = failOnErrors(page)
  await page.goto('/')
  const history = page.getByTestId('assistant-message').first()
  await expect(history).toContainText('use `const` by default'.replace(/`/g, ''), { timeout: 500 })
  await expect(history).toHaveAttribute('data-phase', 'done')
  expect(errors).toEqual([])
})

test('a new answer is paced to the end', async ({ page }) => {
  const errors = failOnErrors(page)
  await page.goto('/')
  const answer = await ask(page, 'How do I debounce a search box?')
  await expect(answer).not.toHaveAttribute('data-phase', 'done')
  await expect(answer).toHaveAttribute('data-phase', 'done', { timeout: 30_000 })
  await expectAnEnding(answer)
  await expect(page.getByText('Answer complete')).toBeAttached()
  expect(errors).toEqual([])
})

test('Show all skips the wait', async ({ page }) => {
  const errors = failOnErrors(page)
  await page.goto('/')
  const answer = await ask(page, 'Show me everything')
  await answer.getByRole('button', { name: 'Show all' }).click()
  // From here on the visible text is everything received; the answer ends as soon as the transport does.
  await expect(answer.getByRole('button', { name: 'Show all' })).toHaveCount(0)
  await expect(answer).toHaveAttribute('data-phase', 'done', { timeout: 30_000 })
  await expectAnEnding(answer)
  expect(errors).toEqual([])
})

test('Stop closes the answer and the chat carries on', async ({ page }) => {
  const errors = failOnErrors(page)
  await page.goto('/')
  const first = await ask(page, 'Stop me')
  await page.waitForTimeout(300)
  await page.getByRole('button', { name: 'Stop' }).click()
  await expect(first).toHaveAttribute('data-phase', 'done', { timeout: 3_000 })

  const second = await ask(page, 'And now a full one')
  await expect(second).toHaveAttribute('data-phase', 'done', { timeout: 30_000 })
  await expectAnEnding(second)
  expect(errors).toEqual([])
})
