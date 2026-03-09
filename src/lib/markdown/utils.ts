export function scanLanguages(content: string): string[] {
  if (!content)
    return []
  const matches = content.matchAll(/```(\w+)/g)
  const inlineMatches = content.matchAll(/`.*?\{:(\w+)\}`/g)
  const langs = new Set<string>()
  for (const match of matches) {
    if (match[1])
      langs.add(match[1].toLowerCase())
  }
  for (const match of inlineMatches) {
    if (match[1])
      langs.add(match[1].toLowerCase())
  }
  return Array.from(langs)
}
