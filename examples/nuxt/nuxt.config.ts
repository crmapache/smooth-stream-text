// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devServer: { port: 5204 },
  app: {
    head: {
      title: 'smooth-stream-text with Nuxt',
      htmlAttrs: { lang: 'en' },
      link: [{ rel: 'icon', href: 'data:,' }],
    },
  },
  css: ['~/assets/chat.css'],
  typescript: {
    // The Playwright specs run from the repository root, which provides @playwright/test.
    tsConfig: { exclude: ['../e2e'] },
  },
})
