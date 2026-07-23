import { parse } from 'node-html-parser'

const removedElements = new Set(['base', 'embed', 'iframe', 'link', 'meta', 'object', 'script', 'style'])
const urlAttributes = new Set(['action', 'formaction', 'href', 'poster', 'src'])

function isSafeUrl(value: string) {
  const normalized = value.trim()
  return (normalized.startsWith('/') && !normalized.startsWith('//')) || /^https:\/\//i.test(normalized)
}

function canonicalAttributes(attributes: Record<string, string>) {
  return Object.fromEntries(Object.entries(attributes)
    .map(([name, value]) => [name.toLowerCase(), value] as const)
    .filter(([name, value]) => !name.startsWith('on') && name !== 'srcdoc' && (!urlAttributes.has(name) || isSafeUrl(value)))
    .sort(([left], [right]) => left.localeCompare(right)))
}

export async function canonicalizeSnapshotHtml(html: string) {
  const root = parse(html)
  for (const element of root.querySelectorAll('*')) {
    if (removedElements.has(element.tagName.toLowerCase())) {
      element.remove()
      continue
    }
    const attributes = canonicalAttributes(element.attributes)
    for (const attribute of Object.keys(element.attributes))
      element.removeAttribute(attribute)
    for (const [attribute, value] of Object.entries(attributes))
      element.setAttribute(attribute, value)
  }
  return root.innerHTML
}

export async function isCanonicalSnapshotHtml(html: string) {
  return html === await canonicalizeSnapshotHtml(html)
}
