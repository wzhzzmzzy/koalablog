import { catppuccinFrappe, catppuccinLatte, catppuccinMacchiato, catppuccinMocha } from '@catppuccin/codemirror'
import { EditorState } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import { describe, expect, it } from 'vitest'
import { catppuccinEditorTheme, resolveEditorCatppuccinTheme } from '@/components/editor/text-editor/catppuccin-theme'
import { CatppuccinTheme } from '@/lib/const/config'

const officialThemes = {
  [CatppuccinTheme.Latte]: catppuccinLatte,
  [CatppuccinTheme.Frappe]: catppuccinFrappe,
  [CatppuccinTheme.Macchiato]: catppuccinMacchiato,
  [CatppuccinTheme.Mocha]: catppuccinMocha,
} as const

function emittedStyleRules(extension: ReturnType<typeof catppuccinEditorTheme>) {
  return EditorState.create({ extensions: [extension] })
    .facet(EditorView.styleModule)
    .flatMap(module => module.getRules().split('\n'))
    .map(rule => rule.replace(/\.ͼ[\w-]+/gu, '.__cm_style__'))
}

describe('codeMirror Catppuccin theme', () => {
  it.each(Object.values(CatppuccinTheme))('matches every official 1.0.3 style rule for %s', (flavor) => {
    const actual = emittedStyleRules(catppuccinEditorTheme(flavor))
    const expected = emittedStyleRules(officialThemes[flavor])

    // 20 editor-chrome rules + 19 syntax-highlight rules from the published
    // @catppuccin/codemirror package. Compare the full public CSS output so
    // every supported syntax tag stays covered, not just a curated sample.
    expect(actual).toHaveLength(39)
    expect(actual).toEqual(expected)
  })

  it.each([
    { light: 'latte', dark: 'mocha', prefersDark: false, expected: CatppuccinTheme.Latte },
    { light: 'latte', dark: 'mocha', prefersDark: true, expected: CatppuccinTheme.Mocha },
    { light: 'frappe', dark: 'macchiato', prefersDark: false, expected: CatppuccinTheme.Frappe },
    { light: 'frappe', dark: 'macchiato', prefersDark: true, expected: CatppuccinTheme.Macchiato },
    { light: 'unknown', dark: 'unknown', prefersDark: false, expected: CatppuccinTheme.Latte },
    { light: 'unknown', dark: 'unknown', prefersDark: true, expected: CatppuccinTheme.Mocha },
  ])('uses the configured flavor for the active color scheme', ({ light, dark, prefersDark, expected }) => {
    expect(resolveEditorCatppuccinTheme({ light, dark, prefersDark })).toBe(expected)
  })
})
