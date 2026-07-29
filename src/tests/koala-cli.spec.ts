import { spawn } from 'node:child_process'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import process from 'node:process'
import { afterEach, describe, expect, it } from 'vitest'

const directories: string[] = []
const cliPath = join(process.cwd(), 'bin', 'koala.mjs')

function runCli(args: string[], env: Partial<NodeJS.ProcessEnv> = {}) {
  return new Promise<{ code: number | null, stdout: string, stderr: string }>((resolve) => {
    const child = spawn(process.execPath, [cliPath, ...args], { env: { ...process.env, ...env } })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (chunk) => {
      stdout += String(chunk)
    })
    child.stderr.on('data', (chunk) => {
      stderr += String(chunk)
    })
    child.on('close', code => resolve({ code, stdout, stderr }))
  })
}

afterEach(async () => Promise.all(directories.splice(0).map(root => rm(root, { recursive: true, force: true }))))

describe('koala one-shot CLI', () => {
  it('initializes, reports status, searches Source, and has no daemon command', async () => {
    const root = await mkdtemp(join(tmpdir(), 'koala-cli-'))
    directories.push(root)
    const initialized = await runCli(['workspace', 'init', root, '--json'])
    expect(initialized.code).toBe(0)
    expect(JSON.parse(initialized.stdout)).toEqual({ initialized: root })
    await writeFile(join(root, 'note.md'), 'HDD-friendly sync policy')

    const status = await runCli(['workspace', 'status', '--json'], { KOALABLOG_WORKSPACE: root })
    expect(status.code).toBe(0)
    expect(JSON.parse(status.stdout)).toMatchObject({ root, files: ['/note'], attachments: [] })

    const search = await runCli(['search', 'friendly', '--json'], { KOALABLOG_WORKSPACE: root })
    expect(search.code).toBe(0)
    expect(JSON.parse(search.stdout).matches).toEqual([expect.objectContaining({ path: '/note' })])

    const daemon = await runCli(['daemon'], { KOALABLOG_WORKSPACE: root })
    expect(daemon.code).toBe(1)
    expect(daemon.stderr).toContain('Usage:')
  })

  it('does not echo a configured Bearer Token if synchronization configuration is incomplete', async () => {
    const result = await runCli(['sync', '--once'], { KOALABLOG_BEARER_TOKEN: 'do-not-print-me' })
    expect(result.code).toBe(1)
    expect(`${result.stdout}${result.stderr}`).not.toContain('do-not-print-me')
  })
})
