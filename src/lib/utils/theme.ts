import { CatppuccinTheme } from '@/lib/const/config'

export function switchTheme(target: string, lightOrDark: 'light' | 'dark') {
  const body = document.body
  const pageEl = document.querySelector('#page') as HTMLDivElement

  if (pageEl) {
    pageEl.dataset.theme = lightOrDark
  }

  Object.values(CatppuccinTheme).forEach((theme) => {
    body.classList.remove(theme)
  })
  body.classList.add(target)
  window.localStorage.setItem('theme', target)
}
