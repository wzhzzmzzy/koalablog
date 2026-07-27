import { CatppuccinColorKeys, generateThemeCSS, Themes } from '@/styles/theme'
import { describe, expect, it } from 'vitest'

describe('catppuccin theme generation', () => {
  it.each(Object.entries(Themes))('%s includes every palette color in generated CSS', (flavor, palette) => {
    const themeName = flavor as keyof typeof Themes
    const css = generateThemeCSS(themeName, themeName)

    expect(Object.keys(palette).sort()).toEqual([...CatppuccinColorKeys].sort())

    for (const color of CatppuccinColorKeys) {
      expect(css).toContain(`--koala-catppuccin-${color}: ${palette[color]};`)
    }
  })
})
