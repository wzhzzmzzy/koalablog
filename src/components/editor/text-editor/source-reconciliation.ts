export interface SourceChange {
  from: number
  to: number
  insert: string
}

export function sourceReconciliationChange(current: string, next: string): SourceChange | null {
  if (current === next)
    return null

  let prefix = 0
  const sharedLength = Math.min(current.length, next.length)
  while (prefix < sharedLength && current.charCodeAt(prefix) === next.charCodeAt(prefix))
    prefix += 1

  let currentSuffix = current.length
  let nextSuffix = next.length
  while (currentSuffix > prefix && nextSuffix > prefix
    && current.charCodeAt(currentSuffix - 1) === next.charCodeAt(nextSuffix - 1)) {
    currentSuffix -= 1
    nextSuffix -= 1
  }

  return { from: prefix, to: currentSuffix, insert: next.slice(prefix, nextSuffix) }
}
