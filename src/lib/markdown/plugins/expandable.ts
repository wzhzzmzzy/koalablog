import { visit } from 'unist-util-visit'

export function remarkExpandable() {
  return (tree: any) => {
    visit(tree, 'containerDirective', (node: any) => {
      if (node.name !== 'expandable')
        return

      const data = node.data || (node.data = {})
      data.hName = 'details'

      // Find the label (directiveLabel)
      const labelIndex = node.children.findIndex(
        (c: any) => c.data && c.data.directiveLabel,
      )

      if (labelIndex !== -1) {
        const label = node.children[labelIndex]
        // Change the label paragraph to a summary element
        label.data = label.data || {}
        label.data.hName = 'summary'
      }
      else {
        // Fallback: use title attribute or default
        const title = node.attributes?.title || 'Details'

        // Create a new summary node
        // We structure it as a paragraph that will be converted to summary
        const summaryNode = {
          type: 'paragraph',
          data: { hName: 'summary' },
          children: [{ type: 'text', value: title }],
        }

        // Insert at the beginning
        node.children.unshift(summaryNode)
      }
    })
  }
}
