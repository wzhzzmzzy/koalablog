import { CatppuccinTheme } from '@/lib/const/config'

export function switchTheme(target: string) {
  const body = document.body
  Object.values(CatppuccinTheme).forEach((theme) => {
    body.classList.remove(theme)
  })
  body.classList.add(target)
  window.localStorage.setItem('theme', target)
}
