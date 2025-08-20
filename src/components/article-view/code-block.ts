export function defineCodeBlockComponent() {
  class CodeBlock extends HTMLElement {
    langEl: HTMLSpanElement | null = null
    contentEl: HTMLDivElement | null = null

    constructor() {
      super()
      this.render()
    }

    connectedCallback() {
      this.langEl = this.querySelector('span.code-lang')
      this.contentEl = this.querySelector('div.code-content')

      this.langEl?.addEventListener('click', this.copy.bind(this))
    }

    copy() {
      if (this.contentEl?.textContent) {
        navigator!.clipboard.writeText(this.contentEl.textContent)
        if (this.langEl?.textContent !== 'Copied') {
          const lang = this.langEl!.textContent
          this.langEl!.textContent = 'Copied'
          setTimeout(() => {
            if (this.langEl)
              this.langEl.textContent = lang
          }, 2000)
        }
      }
    }

    render() {
      const lang = this.getAttribute('lang')
      const originContent = this.innerHTML
      this.innerHTML = `
      <div class="code-block"><span class="code-lang">${(lang || 'text')?.toUpperCase()}</span><div class="code-content">${originContent}</div></div>
    `
    }
  }

  customElements.define('code-block', CodeBlock)
}
