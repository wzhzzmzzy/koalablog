import { visit } from 'unist-util-visit'

export function remarkWikiLinkProperties() {
  return (tree: any) => {
    visit(tree, 'wikiLink', (node: any) => {
      const data = node.data || (node.data = {})
      const props = data.hProperties || (data.hProperties = {})

      props.target = '_blank'
      props.className = 'outgoing-link'
    })
  }
}
