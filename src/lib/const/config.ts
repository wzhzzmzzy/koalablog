import { upperFirst } from 'es-toolkit'

export interface DashboardRoute {
  link: string
  name: string
  mode: 'editor' | 'standalone'
}

export const DASHBOARD_SETTINGS_ROUTE: Array<DashboardRoute> = ([
  { link: 'home', mode: 'editor' },
  { link: 'nav', mode: 'editor' },
  { link: 'posts', mode: 'editor' },
  { link: 'pages', mode: 'editor' },
  { link: 'settings', mode: 'standalone' },
] as Pick<DashboardRoute, 'link' | 'mode'>[])
  .map(i => ({ ...i, name: upperFirst(i.link) }))
