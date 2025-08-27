import { upperFirst } from 'es-toolkit'

export interface DashboardRoute {
  link: string
  name?: string
  mode: 'editor' | 'standalone'
}

export const DASHBOARD_SETTINGS_ROUTE: Array<DashboardRoute> = ([
  { link: '', mode: 'editor' },
  { link: 'nav', mode: 'editor' },
  { link: 'posts', mode: 'editor' },
  { link: 'pages', mode: 'editor' },
  { link: 'oss', name: 'OSS', mode: 'standalong' },
  { link: 'settings', mode: 'standalone' },
] as Pick<DashboardRoute, 'link' | 'mode' | 'name'>[])
  .map(i => ({ ...i, name: i.name || upperFirst(i.link || 'home') }))

export enum CatppuccinTheme {
  Latte = 'latte',
  Frappe = 'frappe',
  Macchiato = 'macchiato',
  Mocha = 'mocha',
}
