import type { Extension } from '@codemirror/state'
import { catppuccinFrappe, catppuccinLatte, catppuccinMacchiato, catppuccinMocha } from '@catppuccin/codemirror'
import { CatppuccinTheme } from '@/lib/const/config'

const themes: Record<CatppuccinTheme, Extension> = {
  [CatppuccinTheme.Latte]: catppuccinLatte,
  [CatppuccinTheme.Frappe]: catppuccinFrappe,
  [CatppuccinTheme.Macchiato]: catppuccinMacchiato,
  [CatppuccinTheme.Mocha]: catppuccinMocha,
}

function configuredTheme(value: string | undefined, fallback: CatppuccinTheme) {
  return Object.values(CatppuccinTheme).includes(value as CatppuccinTheme)
    ? value as CatppuccinTheme
    : fallback
}

export function resolveEditorCatppuccinTheme({
  light,
  dark,
  prefersDark,
}: {
  light: string | undefined
  dark: string | undefined
  prefersDark: boolean
}) {
  return prefersDark
    ? configuredTheme(dark, CatppuccinTheme.Mocha)
    : configuredTheme(light, CatppuccinTheme.Latte)
}

/**
 * The published Catppuccin CodeMirror extension is the source of truth. Keep
 * this selector deliberately shallow so every chrome and syntax rule stays
 * byte-for-byte aligned with the pinned package version.
 */
export function catppuccinEditorTheme(flavor: CatppuccinTheme): Extension {
  return themes[flavor]
}
