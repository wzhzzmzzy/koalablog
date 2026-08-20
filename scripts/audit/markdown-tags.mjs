import process from 'node:process'
import { createClient } from '@libsql/client'
import { prepareMarkdownSource } from '../../src/lib/files/analysis.ts'
import { decodeStoredTags } from '../../src/lib/files/stored-tags.ts'
import { parseLeadingFrontmatter } from '../../src/lib/markdown/frontmatter.ts'

const url = process.env.SQLITE_URL
if (!url) {
  throw new Error('SQLITE_URL is required; use an exported SQLite production snapshot.')
}
if (!url.startsWith('file:') || url.includes('?'))
  throw new Error('SQLITE_URL must be a query-free file: URL for an exported SQLite snapshot.')

const client = createClient({ url })
const rows = await client.execute('SELECT id, renderer, content, tags FROM markdown')
const report = {
  rows: rows.rows.length,
  stored: { json: 0, csv: 0, null: 0, empty: 0, malformed: 0 },
  frontmatter: { absent: 0, valid: 0, invalid: 0, ambiguous: 0 },
  unsupportedTags: 0,
  special: { whitespace: 0, hash: 0, comma: 0, caseOnlyDuplicate: 0 },
  derivedMismatch: 0,
  sampleIds: { malformed: [], unsupported: [], mismatch: [] },
}

function sample(target, id) {
  if (target.length < 20) {
    target.push(id)
  }
}

for (const row of rows.rows) {
  const id = Number(row.id)
  const stored = typeof row.tags === 'string' ? row.tags : ''
  if (row.tags === null || row.tags === undefined) {
    report.stored.null += 1
  }
  else if (!stored.trim()) {
    report.stored.empty += 1
  }
  else {
    try {
      const parsed = JSON.parse(stored)
      if (Array.isArray(parsed) && parsed.every(tag => typeof tag === 'string')) {
        report.stored.json += 1
      }
      else {
        report.stored.malformed += 1
        sample(report.sampleIds.malformed, id)
      }
    }
    catch {
      if (/^[[{"]/.test(stored.trim())) {
        report.stored.malformed += 1
        sample(report.sampleIds.malformed, id)
      }
      else {
        report.stored.csv += 1
      }
    }
  }

  if (row.renderer !== 'markdown') {
    continue
  }
  const content = String(row.content ?? '')
  const frontmatter = parseLeadingFrontmatter(content)
  report.frontmatter[frontmatter.status] += 1
  if (frontmatter.warning === 'unsupported-tags') {
    report.unsupportedTags += 1
    sample(report.sampleIds.unsupported, id)
  }
  const effective = prepareMarkdownSource(content).tags
  if (JSON.stringify(decodeStoredTags(stored)) !== JSON.stringify(effective)) {
    report.derivedMismatch += 1
    sample(report.sampleIds.mismatch, id)
  }
  const lower = new Set()
  for (const tag of effective) {
    if (/\s/.test(tag))
      report.special.whitespace += 1
    if (tag.includes('#'))
      report.special.hash += 1
    if (tag.includes(','))
      report.special.comma += 1
    const normalized = tag.toLowerCase()
    if (lower.has(normalized))
      report.special.caseOnlyDuplicate += 1
    lower.add(normalized)
  }
}

client.close()
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
