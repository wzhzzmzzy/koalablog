export interface LegacySourceMigrationRow {
  id: number
  source: number
  path: string
  title: string
  content: string | null
  tags: string | null
  incoming_links: string | null
  outgoing_links: string | null
  private: number
  remoteTruth: number
  revision: number
  createdAt: number
  updatedAt: number
  deletedAt: number | null
}

export interface MigratedSourceRow extends LegacySourceMigrationRow {
  renderer: 'markdown'
  content: string
  sourceHash: null
}

export const legacySourceMigrationRows: LegacySourceMigrationRow[] = [
  {
    id: 41,
    source: 30,
    path: '/memo/shared',
    title: 'shared',
    content: 'active content',
    tags: 'alpha,中文',
    incoming_links: '["/source"]',
    outgoing_links: '["/target"]',
    private: 0,
    remoteTruth: 1,
    revision: 9,
    createdAt: 1_767_225_600,
    updatedAt: 1_767_312_000,
    deletedAt: null,
  },
  {
    id: 42,
    source: 30,
    path: '/memo/shared',
    title: 'shared',
    content: null,
    tags: null,
    incoming_links: null,
    outgoing_links: null,
    private: 1,
    remoteTruth: 0,
    revision: 7,
    createdAt: 1_767_225_601,
    updatedAt: 1_767_312_001,
    deletedAt: 1_770_000_000,
  },
  {
    id: 43,
    source: 10,
    path: '/memo/shared',
    title: 'shared',
    content: 'older recycled content',
    tags: '',
    incoming_links: '[]',
    outgoing_links: '[]',
    private: 0,
    remoteTruth: 1,
    revision: 3,
    createdAt: 1_700_000_000,
    updatedAt: 1_710_000_000,
    deletedAt: 1_720_000_000,
  },
]

export const migratedSourceRows: MigratedSourceRow[] = legacySourceMigrationRows.map(row => ({
  ...row,
  renderer: 'markdown',
  content: row.content ?? '',
  sourceHash: null,
}))
