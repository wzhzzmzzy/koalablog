export function encodeStoredTags(tags: readonly string[]): string {
  return JSON.stringify(tags)
}

export function decodeStoredTags(value: string | null | undefined): string[] {
  if (!value)
    return []

  const trimmed = value.trim()

  try {
    const parsed: unknown = JSON.parse(value)
    if (Array.isArray(parsed) && parsed.every(tag => typeof tag === 'string'))
      return parsed
    return []
  }
  catch {
    // Legacy values are comma-separated rather than JSON.
  }

  if (trimmed.startsWith('[') || trimmed.startsWith('{') || trimmed.startsWith('"'))
    return []

  return value.split(',').map(tag => tag.trim()).filter(Boolean)
}
