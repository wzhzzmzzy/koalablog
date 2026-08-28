import { randomUUID } from 'node:crypto'
import { unlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createClient } from '@libsql/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { listUsersWithFileStats } from '@/db/user'

const env = {} as Env
let databasePath = ''

describe('per-User File stats', () => {
  beforeEach(async () => {
    databasePath = join(tmpdir(), `koalablog-user-stats-${randomUUID()}.db`)
    vi.stubEnv('SQLITE_URL', `file:${databasePath}`)
    const client = createClient({ url: `file:${databasePath}` })
    await client.executeMultiple(`
      CREATE TABLE user (
        id integer PRIMARY KEY AUTOINCREMENT NOT NULL,
        username text NOT NULL,
        passwordHash text NOT NULL,
        passwordSalt text NOT NULL,
        role text DEFAULT 'member' NOT NULL,
        createdAt integer DEFAULT (unixepoch()) NOT NULL,
        updatedAt integer DEFAULT (unixepoch()) NOT NULL
      );
      CREATE TABLE markdown (
        id integer PRIMARY KEY AUTOINCREMENT NOT NULL,
        source integer NOT NULL,
        path text NOT NULL,
        title text NOT NULL,
        renderer text DEFAULT 'markdown' NOT NULL,
        content text NOT NULL,
        sourceHash text NOT NULL,
        private integer DEFAULT false NOT NULL,
        revision integer DEFAULT 1 NOT NULL,
        createdAt integer DEFAULT (unixepoch()) NOT NULL,
        updatedAt integer DEFAULT (unixepoch()) NOT NULL,
        deletedAt integer,
        userId integer
      );
      INSERT INTO user (id, username, passwordHash, passwordSalt, role) VALUES
        (1, 'admin', 'hash', 'salt', 'admin'),
        (2, 'member', 'hash', 'salt', 'member'),
        (3, 'empty', 'hash', 'salt', 'member');
      INSERT INTO markdown (source, path, title, content, sourceHash, private, deletedAt, userId) VALUES
        (10, '/admin-public', 'admin-public', '', 'a', 0, NULL, 1),
        (30, '/admin-private', 'admin-private', '', 'b', 1, NULL, 1),
        (30, '/admin-trashed', 'admin-trashed', '', 'c', 1, unixepoch(), 1),
        (10, '/member-public-1', 'member-public-1', '', 'd', 0, NULL, 2),
        (10, '/member-public-2', 'member-public-2', '', 'e', 0, NULL, 2),
        (10, '/unowned', 'unowned', '', 'f', 0, NULL, NULL);
    `)
    client.close()
  })

  afterEach(async () => {
    vi.unstubAllEnvs()
    await unlink(databasePath).catch(() => undefined)
  })

  it('counts active Public and Private Files for every User', async () => {
    await expect(listUsersWithFileStats(env)).resolves.toEqual([
      { id: 1, username: 'admin', role: 'admin', publicFileCount: 1, privateFileCount: 1 },
      { id: 3, username: 'empty', role: 'member', publicFileCount: 0, privateFileCount: 0 },
      { id: 2, username: 'member', role: 'member', publicFileCount: 2, privateFileCount: 0 },
    ])
  })
})
