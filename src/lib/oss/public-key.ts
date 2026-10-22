const publicSources = new Set(['article', 'post', 'page', 'oss', 'attachments'])

export function publicObjectKey(link: string | undefined) {
  const separator = link?.indexOf('_') ?? -1
  if (!link || separator < 1)
    return null
  const source = link.slice(0, separator)
  const path = link.slice(separator + 1)
  if (!publicSources.has(source) || !path || path.includes('\\')
    || path.split('/').some(segment => !segment || segment === '.' || segment === '..')) {
    return null
  }
  return `${source}/${path}`
}
