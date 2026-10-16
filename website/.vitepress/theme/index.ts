import type { Theme } from 'vitepress'
import DefaultTheme from 'vitepress/theme'
import SourceSurvey from './SourceSurvey.vue'
import { trackDocs } from './track'
import './custom.css'

export default {
  extends: DefaultTheme,
  enhanceApp({ app }) {
    app.component('SourceSurvey', SourceSurvey)
    if (typeof window !== 'undefined') trackDocs()
  },
} satisfies Theme
