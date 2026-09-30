/** Read a plain-text @brief from the leading HTML comments, without parsing Svelte. */
export function getSvelteBrief(content: string | null | undefined): string {
  let header = (content ?? '').trimStart()

  while (header.startsWith('<!--')) {
    const end = header.indexOf('-->', 4)
    if (end === -1)
      return ''

    const comment = header.slice(4, end).trim()
    if (comment.startsWith('@brief:'))
      return comment.slice('@brief:'.length).replace(/\s+/g, ' ').trim()

    header = header.slice(end + 3).trimStart()
  }

  return ''
}
