import { visit } from 'unist-util-visit'

export function rehypeCodeWrapper() {
  return (tree: any) => {
    visit(tree, 'element', (node: any, index: number, parent: any) => {
      if (node.tagName !== 'pre')
        return
      if (node.properties?.wrapped)
        return

      const codeNode = node.children.find((c: any) => c.tagName === 'code')
      if (!codeNode)
        return

      const classNames = codeNode.properties?.className || []
      const langClass = classNames.find((c: string) => typeof c === 'string' && c.startsWith('language-'))
      const lang = langClass ? langClass.replace('language-', '') : ''

      node.properties = node.properties || {}
      node.properties.wrapped = true

      const wrapper = {
        type: 'element',
        tagName: 'div',
        properties: { className: ['code-block'] },
        children: [
          {
            type: 'element',
            tagName: 'span',
            properties: { className: ['code-lang'] },
            children: [{ type: 'text', value: lang.toUpperCase() }],
          },
          {
            type: 'element',
            tagName: 'div',
            properties: { className: ['code-content'] },
            children: [node],
          },
        ],
      }

      parent.children[index] = wrapper
    })
  }
}
