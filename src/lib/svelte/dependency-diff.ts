import type { SvelteDependencyManifestEntry } from './contracts'
import { canonicalDependencies } from './artifact-hash'

export const DEPENDENCY_DIFF_LIMIT = 20

export interface DependencyChange {
  kind: 'added' | 'changed' | 'removed'
  previous?: SvelteDependencyManifestEntry
  proposed?: SvelteDependencyManifestEntry
  url: string
}

export interface DependencyDiff {
  changes: DependencyChange[]
  truncated: boolean
}

function sameEntry(left: SvelteDependencyManifestEntry, right: SvelteDependencyManifestEntry) {
  return left.url === right.url && left.bytes === right.bytes && left.sha256 === right.sha256
}

export function sameDependencies(
  left: readonly SvelteDependencyManifestEntry[],
  right: readonly SvelteDependencyManifestEntry[],
) {
  const canonicalLeft = canonicalDependencies(left)
  const canonicalRight = canonicalDependencies(right)
  return canonicalLeft.length === canonicalRight.length
    && canonicalLeft.every((entry, index) => sameEntry(entry, canonicalRight[index]!))
}

export function dependencyDiff(
  previous: readonly SvelteDependencyManifestEntry[],
  proposed: readonly SvelteDependencyManifestEntry[],
  limit = DEPENDENCY_DIFF_LIMIT,
): DependencyDiff {
  const previousByUrl = new Map(canonicalDependencies(previous).map(entry => [entry.url, entry]))
  const proposedByUrl = new Map(canonicalDependencies(proposed).map(entry => [entry.url, entry]))
  const changes: DependencyChange[] = []
  for (const url of [...new Set([...previousByUrl.keys(), ...proposedByUrl.keys()])].sort((left, right) => left.localeCompare(right))) {
    const previousEntry = previousByUrl.get(url)
    const proposedEntry = proposedByUrl.get(url)
    if (!previousEntry) {
      changes.push({ kind: 'added', proposed: proposedEntry, url })
      continue
    }
    if (!proposedEntry) {
      changes.push({ kind: 'removed', previous: previousEntry, url })
      continue
    }
    if (!sameEntry(previousEntry, proposedEntry))
      changes.push({ kind: 'changed', previous: previousEntry, proposed: proposedEntry, url })
  }
  return { changes: changes.slice(0, limit), truncated: changes.length > limit }
}
