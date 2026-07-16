import type { LegacyFileRow } from '@/lib/files/migration-audit'
import { MarkdownSource } from '@/db'

export function makeLegacyFileRow(
  overrides: Partial<LegacyFileRow> & Pick<LegacyFileRow, 'id' | 'link'>,
): LegacyFileRow {
  return {
    id: overrides.id,
    source: overrides.source ?? MarkdownSource.Page,
    link: overrides.link,
    subject: overrides.subject ?? overrides.link.split('/').filter(Boolean).at(-1) ?? '',
    content: overrides.content ?? '',
    tags: overrides.tags ?? null,
    incoming_links: overrides.incoming_links ?? null,
    outgoing_links: overrides.outgoing_links ?? null,
    private: overrides.private ?? false,
    remoteTruth: overrides.remoteTruth ?? false,
    createdAt: overrides.createdAt ?? new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: overrides.updatedAt ?? new Date('2026-01-02T00:00:00.000Z'),
    deletedAt: overrides.deletedAt ?? null,
  }
}

export const successfulLegacyFileRows: LegacyFileRow[] = [
  makeLegacyFileRow({ id: 10, link: 'about', subject: 'about' }),
  makeLegacyFileRow({
    id: 11,
    source: MarkdownSource.Memo,
    link: 'memo/私人',
    subject: '私人',
    content: 'private memo',
    tags: 'private,中文',
    outgoing_links: '["/about"]',
    private: true,
  }),
  makeLegacyFileRow({
    id: 12,
    source: MarkdownSource.Post,
    link: 'post/hello',
    subject: 'hello',
    content: 'current post',
    outgoing_links: '[{"subject":"about","link":"about"},{"subject":"Title only"}]',
    remoteTruth: true,
  }),
  makeLegacyFileRow({
    id: 13,
    source: MarkdownSource.Post,
    link: 'post/hello',
    subject: 'Old headline',
    content: 'recycled post',
    deletedAt: new Date('2026-02-01T00:00:00.000Z'),
  }),
  makeLegacyFileRow({
    id: 14,
    source: MarkdownSource.Post,
    link: '/post//hello',
    subject: 'hello',
    content: 'older recycled post',
    deletedAt: new Date('2026-02-02T00:00:00.000Z'),
  }),
]

export const blockingLegacyFileRows: LegacyFileRow[] = [
  makeLegacyFileRow({ id: 1, source: MarkdownSource.Memo, link: 'memo/note', subject: 'Legacy Note' }),
  makeLegacyFileRow({ id: 2, source: MarkdownSource.Memo, link: '/memo//note', subject: 'note' }),
  makeLegacyFileRow({
    id: 3,
    source: MarkdownSource.Memo,
    link: 'memo/note',
    subject: 'note',
    deletedAt: new Date('2026-02-01T00:00:00.000Z'),
  }),
  makeLegacyFileRow({
    id: 4,
    source: MarkdownSource.Memo,
    link: '/memo//note',
    subject: 'note',
    deletedAt: new Date('2026-02-02T00:00:00.000Z'),
  }),
  makeLegacyFileRow({ id: 5, source: MarkdownSource.Post, link: 'post/bad.md', subject: 'bad.md' }),
]

export const restoreConflictLegacyFixture = {
  rows: [
    makeLegacyFileRow({ id: 20, source: MarkdownSource.Post, link: 'post/shared', subject: 'Current Post' }),
    makeLegacyFileRow({
      id: 21,
      source: MarkdownSource.Wiki,
      link: 'wiki/shared',
      subject: 'Archived Wiki',
      deletedAt: new Date('2026-03-01T00:00:00.000Z'),
    }),
    makeLegacyFileRow({
      id: 22,
      source: MarkdownSource.Post,
      link: 'post/shared',
      subject: 'Archived Post',
      deletedAt: new Date('2026-03-02T00:00:00.000Z'),
    }),
  ],
  cases: [
    { recycledId: 21, activeId: 20, legacyConflict: 'title_only', expectedAfterMigration: 'restorable' },
    { recycledId: 22, activeId: 20, legacyConflict: 'path', expectedAfterMigration: 'conflict' },
  ],
} as const
