import { tool } from 'ai'
import { z } from 'zod'

export const tools = {
  getWeather: tool({
    description: 'Current weather for a city.',
    inputSchema: z.object({ city: z.string() }),
    execute: async ({ city }) => {
      await new Promise((resolve) => setTimeout(resolve, 600))
      return { city, temperatureC: 19, conditions: 'partly cloudy' }
    },
  }),
}
