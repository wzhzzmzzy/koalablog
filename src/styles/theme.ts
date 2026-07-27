export const CatppuccinColorKeys = [
  'rosewater',
  'flamingo',
  'pink',
  'mauve',
  'red',
  'maroon',
  'peach',
  'yellow',
  'green',
  'teal',
  'sky',
  'sapphire',
  'blue',
  'lavender',
  'text',
  'subtext-1',
  'subtext-0',
  'overlay-2',
  'overlay-1',
  'overlay-0',
  'surface-2',
  'surface-1',
  'surface-0',
  'base',
  'mantle',
  'crust',
] as const

type CatppuccinColor = typeof CatppuccinColorKeys[number]
type CatppuccinPalette = Record<CatppuccinColor, `#${string}`>

export const CatppuccinLatte: CatppuccinPalette = {
  'rosewater': '#dc8a78',
  'flamingo': '#dd7878',
  'pink': '#ea76cb',
  'mauve': '#8839ef',
  'red': '#d20f39',
  'maroon': '#e64553',
  'peach': '#fe640b',
  'yellow': '#df8e1d',
  'green': '#40a02b',
  'teal': '#179299',
  'sky': '#04a5e5',
  'sapphire': '#209fb5',
  'blue': '#1e66f5',
  'lavender': '#7287fd',
  'text': '#4c4f69',
  'subtext-1': '#5c5f77',
  'subtext-0': '#6c6f85',
  'overlay-2': '#7c7f93',
  'overlay-1': '#8c8fa1',
  'overlay-0': '#9ca0b0',
  'surface-2': '#acb0be',
  'surface-1': '#bcc0cc',
  'surface-0': '#ccd0da',
  'base': '#eff1f5',
  'mantle': '#e6e9ef',
  'crust': '#dce0e8',
}

export const CatppuccinFrappe: CatppuccinPalette = {
  'rosewater': '#f2d5cf',
  'flamingo': '#eebebe',
  'pink': '#f4b8e4',
  'mauve': '#ca9ee6',
  'red': '#e78284',
  'maroon': '#ea999c',
  'peach': '#ef9f76',
  'yellow': '#e5c890',
  'green': '#a6d189',
  'teal': '#81c8be',
  'sky': '#99d1db',
  'sapphire': '#85c1dc',
  'blue': '#8caaee',
  'lavender': '#babbf1',
  'text': '#c6d0f5',
  'subtext-1': '#b5bfe2',
  'subtext-0': '#a5adce',
  'overlay-2': '#949cbb',
  'overlay-1': '#838ba7',
  'overlay-0': '#737994',
  'surface-2': '#626880',
  'surface-1': '#51576d',
  'surface-0': '#414559',
  'base': '#303446',
  'mantle': '#292c3c',
  'crust': '#232634',
}

export const CatppuccinMacchiato: CatppuccinPalette = {
  'rosewater': '#f4dbd6',
  'flamingo': '#f0c6c6',
  'pink': '#f5bde6',
  'mauve': '#c6a0f6',
  'red': '#ed8796',
  'maroon': '#ee99a0',
  'peach': '#f5a97f',
  'yellow': '#eed49f',
  'green': '#a6da95',
  'teal': '#8bd5ca',
  'sky': '#91d7e3',
  'sapphire': '#7dc4e4',
  'blue': '#8aadf4',
  'lavender': '#b7bdf8',
  'text': '#cad3f5',
  'subtext-1': '#b8c0e0',
  'subtext-0': '#a5adcb',
  'overlay-2': '#939ab7',
  'overlay-1': '#8087a2',
  'overlay-0': '#6e738d',
  'surface-2': '#5b6078',
  'surface-1': '#494d64',
  'surface-0': '#363a4f',
  'base': '#24273a',
  'mantle': '#1e2030',
  'crust': '#181926',
}

export const CatppuccinMocha: CatppuccinPalette = {
  'rosewater': '#f5e0dc',
  'flamingo': '#f2cdcd',
  'pink': '#f5c2e7',
  'mauve': '#cba6f7',
  'red': '#f38ba8',
  'maroon': '#eba0ac',
  'peach': '#fab387',
  'yellow': '#f9e2af',
  'green': '#a6e3a1',
  'teal': '#94e2d5',
  'sky': '#89dceb',
  'sapphire': '#74c7ec',
  'blue': '#89b4fa',
  'lavender': '#b4befe',
  'text': '#cdd6f4',
  'subtext-1': '#bac2de',
  'subtext-0': '#a6adc8',
  'overlay-2': '#9399b2',
  'overlay-1': '#7f849c',
  'overlay-0': '#6c7086',
  'surface-2': '#585b70',
  'surface-1': '#45475a',
  'surface-0': '#313244',
  'base': '#1e1e2e',
  'mantle': '#181825',
  'crust': '#11111b',
}

export const Themes = {
  latte: CatppuccinLatte,
  frappe: CatppuccinFrappe,
  macchiato: CatppuccinMacchiato,
  mocha: CatppuccinMocha,
}

/**
 * Dashboard tokens remain flavor-relative: switching Latte/Frappe/Macchiato/
 * Mocha changes every semantic surface together instead of introducing a
 * second, fixed UI palette.
 */
const DashboardSemanticColors = {
  'canvas': 'base',
  'sidebar': 'mantle',
  'panel': 'mantle',
  'panel-raised': 'base',
  'foreground': 'text',
  'muted': 'surface-0',
  'muted-foreground': 'subtext-0',
  'border': 'surface-1',
  'input': 'surface-0',
  'hover': 'surface-0',
  'active': 'surface-1',
  'primary': 'mauve',
  'on-primary': 'base',
  'secondary': 'surface-0',
  'accent': 'lavender',
  'accent-foreground': 'crust',
  'destructive': 'red',
  'on-destructive': 'base',
  'success': 'green',
  'warning': 'yellow',
  'info': 'blue',
  'ring': 'mauve',
  'link': 'blue',
  'code': 'crust',
} as const satisfies Record<string, CatppuccinColor>

function generateThemeVariables(theme: CatppuccinPalette) {
  const paletteVars = Object.entries(theme)
    .map(([key, value]) => `  --koala-catppuccin-${key}: ${value};`)
    .join('\n')
  const dashboardVars = Object.entries(DashboardSemanticColors)
    .map(([key, color]) => `  --koala-dashboard-${key}: var(--koala-catppuccin-${color});`)
    .join('\n')

  return `${paletteVars}\n${dashboardVars}`
}

export function generateThemeCSS(lightTheme: keyof typeof Themes, darkTheme: keyof typeof Themes) {
  const lightVars = generateThemeVariables(Themes[lightTheme])
  const darkVars = generateThemeVariables(Themes[darkTheme])

  return `
<style>
:root {
${lightVars}
}

@media (prefers-color-scheme: dark) {
  :root {
${darkVars}
  }
}

[data-theme="light"] {
${lightVars}
}

[data-theme="dark"] {
${darkVars}
}
</style>
`
}
