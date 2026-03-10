import presetIcons from '@unocss/preset-icons'
import { defineConfig, presetUno, transformerDirectives } from 'unocss'

export default defineConfig({
  presets: [
    presetUno(),
    presetIcons(),
  ],
  safelist: [
    ...[true, false].map(show => `i-tabler:arrow-badge-${show ? 'left' : 'right'}-filled`),
  ],
  transformers: [
    transformerDirectives(),
  ],
  theme: {
    fontFamily: {
      'sans': 'var(--koala-font-sans)',
      'serif': 'var(--koala-font-serif)',
      'mono': 'var(--koala-font-mono)',
    },
  },
  shortcuts: {
    // Font family shortcuts
    'font-ui': 'font-sans',
    'font-content': 'font-serif',
    'font-code': 'font-mono',
  },
})
