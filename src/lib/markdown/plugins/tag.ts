import { findAndReplace } from 'mdast-util-find-and-replace'

export function remarkTag() {
  return (tree: any) => {
    findAndReplace(tree, [
      /(^|\s)(#[a-z0-9]+)(\s|$)/gi,
      (match: string, prefix: string, tag: string, suffix: string) => {
        // match: " #tag "
        // prefix: " "
        // tag: "#tag"
        // suffix: " "

        const nodes: any[] = []

        if (prefix) {
          nodes.push({ type: 'text', value: prefix })
        }

        nodes.push({
          type: 'text',
          value: tag,
          data: {
            hName: 'span',
            hProperties: { className: 'tag' },
          },
        })

        if (suffix) {
          nodes.push({ type: 'text', value: suffix })
        }

        return nodes
      },
    ])
  }
}
