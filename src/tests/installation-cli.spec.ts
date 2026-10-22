import { execFile } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import process from 'node:process'
import { promisify } from 'node:util'
import { createClient } from '@libsql/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

const run = promisify(execFile)
let directory: string

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'koala-initialize-cli-'))
})

afterEach(async () => {
  await rm(directory, { recursive: true, force: true })
})

describe('installation initialization CLI', () => {
  it.each([[], ['--sqlite', '--d1'], ['--sqlite', '--remote'], ['--d1']])('rejects ambiguous or implicit targets: %j', async (...args) => {
    await expect(run(process.execPath, ['scripts/db/initialize-runtime.mjs', ...args], {
      env: { ...process.env, SQLITE_URL: '', KOALA_CONFIG_PATH: '' },
    })).rejects.toMatchObject({ code: 1 })
  })

  it('initializes only the explicitly selected SQLite installation and preserves File revision and Source', async () => {
    const databasePath = join(directory, 'local.db')
    const configPath = join(directory, 'config.json')
    const client = createClient({ url: `file:${databasePath}` })
    for (const migration of ['0000_init.sql', '0001_memo_source_remap.sql', '0002_user.sql'])
      await client.executeMultiple(await readFile(`migrations/${migration}`, 'utf8'))
    await client.execute({
      sql: 'INSERT INTO markdown(source,path,title,content,sourceHash,revision) VALUES(?,?,?,?,?,?)',
      args: [30, '/memo/kept', 'kept', 'unchanged', 'kept-hash', 9],
    })
    await writeFile(configPath, JSON.stringify({ _KoalaConfig_: { _runtime: { ready: true }, auth: { adminKey: 'legacy-password', bearerToken: 'legacy-token' } } }))
    const environment = { ...process.env, SQLITE_URL: `file:${databasePath}`, KOALA_CONFIG_PATH: configPath }
    try {
      for (let attempt = 0; attempt < 2; attempt++) {
        const result = await run(process.execPath, ['scripts/db/initialize-runtime.mjs', '--sqlite'], { env: environment })
        expect(result.stdout).toContain('Existing installation initialization complete')
      }
      expect((await client.execute('SELECT content,sourceHash,revision,userId FROM markdown')).rows).toEqual([
        { content: 'unchanged', sourceHash: 'kept-hash', revision: 9, userId: 1 },
      ])
      expect((await client.execute('SELECT count(*) AS count FROM user')).rows[0].count).toBe(1)
      expect((await client.execute('SELECT count(*) AS count FROM creation_template_catalog')).rows[0].count).toBe(1)
      expect(JSON.parse(await readFile(configPath, 'utf8'))._KoalaConfig_.auth).toEqual({})
    }
    finally {
      client.close()
    }
  }, 20000)
})
