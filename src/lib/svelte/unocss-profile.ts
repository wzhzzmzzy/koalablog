export const UNOCSS_ARTIFACT_SCOPE = ':where([data-koala-artifact-root])'

export const UNOCSS_CONFIG_PROFILE = {
  presetUno: { preflight: 'on-demand' },
  profile: 'koala-unocss-v1',
  shortcuts: {
    'font-code': 'font-mono',
    'font-content': 'font-serif',
    'font-ui': 'font-sans',
  },
  theme: {
    fontFamily: {
      mono: 'var(--koala-font-mono)',
      sans: 'var(--koala-font-sans)',
      serif: 'var(--koala-font-serif)',
    },
  },
} as const

export const UNOCSS_CONFIG_SERIALIZATION = JSON.stringify(UNOCSS_CONFIG_PROFILE)
export const UNOCSS_CONFIG_HASH = '5f551814475c63df443f6f48a7b758d590acf3e927ebd5e17ce365141b154574'
