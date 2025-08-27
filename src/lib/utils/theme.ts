export function switchTheme(target: string, lightOrDark: 'light' | 'dark') {
  const pageEl = document.querySelector('#page') as HTMLDivElement

  if (pageEl) {
    pageEl.dataset.theme = lightOrDark
  }

  window.localStorage.setItem('theme', target)
}
