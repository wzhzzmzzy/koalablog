import presetIcons from '@unocss/preset-icons'
import { presetRemToPx } from '@unocss/preset-rem-to-px'
import { defineConfig, presetUno } from 'unocss'

export default defineConfig({
  presets: [
    presetUno(),
    presetIcons(),
    presetRemToPx({
      baseFontSize: 16,
    }),
  ],
  safelist: [
    ...[true, false].map(show => `i-tabler:arrow-badge-${show ? 'left' : 'right'}-filled`),
  ],
})
