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
})
