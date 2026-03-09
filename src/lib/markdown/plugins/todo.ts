import { fromHtml } from 'hast-util-from-html'
import { visit } from 'unist-util-visit'

const UNCHECKED_ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-square task-list-icon"><rect width="18" height="18" x="3" y="3" rx="2"/></svg>`
const CHECKED_ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-square-check task-list-icon"><rect width="18" height="18" x="3" y="3" rx="2"/><path d="m9 12 2 2 4-4"/></svg>`

export function rehypeTodo() {
  return (tree: any) => {
    visit(tree, 'element', (node: any, index: number, parent: any) => {
      if (node.tagName !== 'input')
        return
      if (node.properties?.type !== 'checkbox')
        return

      const checked = node.properties.checked || false
      const iconHtml = checked ? CHECKED_ICON : UNCHECKED_ICON

      const iconHast = fromHtml(iconHtml, { fragment: true }).children[0]

      const span = {
        type: 'element',
        tagName: 'span',
        properties: { className: ['task-list-marker'] },
        children: [iconHast],
      }

      parent.children[index] = span

      if (parent.tagName === 'li' && checked) {
        const classes = parent.properties.className || (parent.properties.className = [])
        if (!classes.includes('checked')) {
          classes.push('checked')
        }
      }
    })
  }
}
