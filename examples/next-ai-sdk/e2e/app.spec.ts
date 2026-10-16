import { expect, test, type Locator, type Page } from '@playwright/test'
import { answers } from '../lib/answers'

const endings = [...answers.map((answer) => answer.trim().split('\n').pop()!), 'Enjoy your day in Lisbon.']

function collectErrors(page: Page) {
  const errors: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text())
  })
  page.on('pageerror', (error) => errors.push(error.message))
  return errors
}

async function ask(page: Page, question: string) {
  const before = await page.getByTestId('assistant-message').count()
  await page.getByLabel('Your question').fill(question)
  await page.getByRole('button', { name: 'Send' }).click()
  await expect(page.getByTestId('assistant-message')).toHaveCount(before + 1, { timeout: 10_000 })
  return page.getByTestId('assistant-message').last()
}

async function expectAnEnding(answer: Locator) {
  const text = await answer.innerText()
  expect(endings.some((ending) => text.includes(ending))).toBe(true)
}

test('history is in the server HTML and does not replay', async ({ page, request }) => {
  const html = await (await request.get('/')).text()
  expect(html).toContain('a short way to check for both')

  const errors = collectErrors(page)
  await page.goto('/')
  await expect(page.getByTestId('assistant-message').first()).toHaveAttribute('data-phase', 'done')
  expect(errors).toEqual([])
})

test('a new answer is paced to the end', async ({ page }) => {
  const errors = collectErrors(page)
  await page.goto('/')
  const answer = await ask(page, 'How long should I cache static files?')
  await expect(answer).toHaveAttribute('data-phase', 'done', { timeout: 30_000 })
  await expectAnEnding(answer)
  await expect(page.getByText('Answer complete')).toBeAttached()
  expect(errors).toEqual([])
})

test('text parts and a tool part share one cursor', async ({ page }) => {
  const errors = collectErrors(page)
  await page.goto('/')
  const answer = await ask(page, 'What is the weather in Lisbon?')
  await expect(answer).toHaveAttribute('data-phase', 'done', { timeout: 30_000 })
  await expect(answer).toContainText('Let me look up the current weather in Lisbon.')
  await expect(answer).toContainText('getWeather: Lisbon, 19 °C, partly cloudy')
  await expect(answer).toContainText('Enjoy your day in Lisbon.')
  expect(errors).toEqual([])
})

test('Show all skips the wait', async ({ page }) => {
  const errors = collectErrors(page)
  await page.goto('/')
  const answer = await ask(page, 'Show me everything')
  await answer.getByRole('button', { name: 'Show all' }).click()
  await expect(answer.getByRole('button', { name: 'Show all' })).toHaveCount(0)
  await expect(answer).toHaveAttribute('data-phase', 'done', { timeout: 30_000 })
  await expectAnEnding(answer)
  expect(errors).toEqual([])
})

test('Stop closes the answer and the chat carries on', async ({ page }) => {
  const errors = collectErrors(page)
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
