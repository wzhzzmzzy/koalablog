/**
 * Generate a unique ID for a heading based on its text content
 */
export function generateHeadingId(text: string, index: number = 0): string {
  const baseId = text
    .toLowerCase()
    .replace(/[^\w\s]/g, '')
    .replace(/\s+/g, '-')
    .replace(/^-+|-+$/g, '') // Remove leading/trailing hyphens

  return index > 0 ? `${baseId}-${index}` : baseId
}

/**
 * Add IDs to all heading elements in HTML content
 */
export async function addHeadingIds(htmlContent: string): Promise<string> {
  // Check if running in browser environment
  if (typeof window !== 'undefined' && window.DOMParser) {
    const parser = new DOMParser()
    const doc = parser.parseFromString(htmlContent, 'text/html')
    const headings = doc.querySelectorAll('h1, h2, h3, h4, h5, h6')

    const usedIds = new Set<string>()

    headings.forEach((heading) => {
      if (!heading.id) {
        const text = heading.textContent?.trim() || ''
        const baseId = generateHeadingId(text)
        let finalId = baseId
        let counter = 1

        // Ensure unique IDs
        while (usedIds.has(finalId)) {
          finalId = `${baseId}-${counter}`
          counter++
        }

        heading.id = finalId
        usedIds.add(finalId)
      }
      else {
        usedIds.add(heading.id)
      }
    })

    return doc.body.innerHTML
  }

  // Node.js environment - use dynamic import to avoid bundling in browser
  const { parse } = await import('node-html-parser')

  const root = parse(htmlContent)
  const headings = root.querySelectorAll('h1, h2, h3, h4, h5, h6')

  const usedIds = new Set<string>()

  headings.forEach((heading: any) => {
    if (!heading.getAttribute('id')) {
      const text = heading.text.trim()
      const baseId = generateHeadingId(text)
      let finalId = baseId
      let counter = 1

      // Ensure unique IDs
      while (usedIds.has(finalId)) {
        finalId = `${baseId}-${counter}`
        counter++
      }

      heading.setAttribute('id', finalId)
      usedIds.add(finalId)
    }
    else {
      usedIds.add(heading.getAttribute('id'))
    }
  })

  return root.innerHTML
}

/**
 * Synchronous version for browser-only usage
 */
export function addHeadingIdsSync(htmlContent: string): string {
  if (typeof window === 'undefined') {
    throw new TypeError('addHeadingIdsSync can only be used in browser environment')
  }

  const parser = new DOMParser()
  const doc = parser.parseFromString(htmlContent, 'text/html')
  const headings = doc.querySelectorAll('h1, h2, h3, h4, h5, h6')

  const usedIds = new Set<string>()

  headings.forEach((heading) => {
    if (!heading.id) {
      const text = heading.textContent?.trim() || ''
      const baseId = generateHeadingId(text)
      let finalId = baseId
      let counter = 1

      // Ensure unique IDs
      while (usedIds.has(finalId)) {
        finalId = `${baseId}-${counter}`
        counter++
      }

      heading.id = finalId
      usedIds.add(finalId)
    }
    else {
      usedIds.add(heading.id)
    }
  })

  return doc.body.innerHTML
}

/**
 * Extract heading information from HTML content
 */
export interface HeadingItem {
  id: string
  text: string
  level: number
}

export async function extractHeadings(htmlContent: string): Promise<HeadingItem[]> {
  // Check if running in browser environment
  if (typeof window !== 'undefined' && window.DOMParser) {
    const parser = new DOMParser()
    const doc = parser.parseFromString(htmlContent, 'text/html')
    const headings = doc.querySelectorAll('h1, h2, h3, h4, h5, h6')

    return Array.from(headings).map((heading) => {
      const level = Number.parseInt(heading.tagName.charAt(1))
      const text = heading.textContent?.trim() || ''
      const id = heading.id || generateHeadingId(text)

      return { id, text, level }
    })
  }

  // Node.js environment - use dynamic import to avoid bundling in browser
  const { parse } = await import('node-html-parser')

  const root = parse(htmlContent)
  const headings = root.querySelectorAll('h1, h2, h3, h4, h5, h6')

  return headings.map((heading: any) => {
    const level = Number.parseInt(heading.tagName.charAt(1))
    const text = heading.text.trim()
    const id = heading.getAttribute('id') || generateHeadingId(text)

    return { id, text, level }
  })
}

/**
 * Synchronous version for browser-only usage
 */
export function extractHeadingsSync(htmlContent: string): HeadingItem[] {
  if (typeof window === 'undefined') {
    throw new TypeError('extractHeadingsSync can only be used in browser environment')
  }

  const parser = new DOMParser()
  const doc = parser.parseFromString(htmlContent, 'text/html')
  const headings = doc.querySelectorAll('h1, h2, h3, h4, h5, h6')

  return Array.from(headings).map((heading) => {
    const level = Number.parseInt(heading.tagName.charAt(1))
    const text = heading.textContent?.trim() || ''
    const id = heading.id || generateHeadingId(text)

    return { id, text, level }
  })
}
