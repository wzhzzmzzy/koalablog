import { presetRemToPx } from '@unocss/preset-rem-to-px'
import { defineConfig, presetUno } from 'unocss'

export default defineConfig({
  presets: [
    presetUno(),
    presetRemToPx({
      baseFontSize: 16,
    }),
  ],
})
