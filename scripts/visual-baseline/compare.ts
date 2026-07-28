#!/usr/bin/env tsx
/**
 * Compare-against-baseline harness (slice 04).
 *
 * Boots the e2e server on E2E_PORT=4333, captures the full page matrix once,
 * diffs each capture against the baseline screenshots in the durable archive,
 * and reports PASS/FAIL against the calibrated threshold in manifest.json.
 *
 * Usage:
 *   pnpm tsx scripts/visual-baseline/compare.ts [--archive <dir>] [--out <dir>]
 *
 * Defaults:
 *   --archive  /private/tmp/koalablog-visual-baseline   (the slice-02 baseline)
 *   --out      <archive>/comparison                     (where new captures go)
 *
 * Exit code 0 = every page under threshold, 1 = any page at/above threshold.
 *
 * This script reuses the shared matrix + diff modules (slice 06 also depends
 * on them) but is a separate CLI so capture.ts's public API stays stable.
 */

import type { Buffer } from 'node:buffer'
import type { BaselineManifest, PageDiffResult } from './types'
import { type ChildProcess, spawn } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { chromium, type Page } from '@playwright/test'
import { diffScreenshots, formatDiffResult, verifyAgainstThreshold } from './diff'
import { BASE_URL, E2E_AUTHORIZATION, E2E_PORT, PAGE_MATRIX, STABILISE_CSS } from './matrix'

const REPO_ROOT = path.resolve(import.meta.dirname, '..', '..')
const DEFAULT_ARCHIVE = '/private/tmp/koalablog-visual-baseline'

interface Args {
  archiveDir: string
  outDir: string
}

function parseArgs(): Args {
  const args = process.argv.slice(2)
  let archiveDir = DEFAULT_ARCHIVE
  let outDir = ''
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--archive' && args[i + 1]) {
      archiveDir = args[i + 1]
      i++
    }
    else if (args[i] === '--out' && args[i + 1]) {
      outDir = args[i + 1]
      i++
    }
  }
  if (!outDir)
    outDir = path.join(archiveDir, 'comparison')
  return { archiveDir, outDir }
}

async function killPort(port: number): Promise<void> {
  try {
    const { execSync } = await import('node:child_process')
    const pids = execSync(`lsof -ti :${port} 2>/dev/null || true`, { encoding: 'utf8' }).trim()
    if (pids) {
      for (const pid of pids.split('\n')) {
        try {
          process.kill(Number(pid), 'SIGKILL')
        }
        catch {
          // already dead
        }
      }
    }
  }
  catch {
    // best-effort
  }
}

function startServer(): ChildProcess {
  const env = {
    ...process.env,
    E2E_PORT: String(E2E_PORT),
  }
  const proc = spawn('pnpm', ['run', 'test:e2e:server'], {
    cwd: REPO_ROOT,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: true,
  })

  proc.stdout?.on('data', (data: Buffer) => {
    const line = data.toString().trim()
    if (line)
      console.log(`  [server] ${line}`)
  })
  proc.stderr?.on('data', (data: Buffer) => {
    const line = data.toString().trim()
    if (line)
      console.error(`  [server:err] ${line}`)
  })

  return proc
}

async function waitForServer(baseUrl: string, timeoutMs = 180_000): Promise<void> {
  const deadline = Date.now() + timeoutMs
  const healthUrl = `${baseUrl}/api/health`
  console.log(`  Waiting for server at ${healthUrl} ...`)

  while (Date.now() < deadline) {
    try {
      const resp = await fetch(healthUrl)
      if (resp.ok) {
        console.log('  Server is ready.')
        return
      }
    }
    catch {
      // not ready yet
    }
    await new Promise(r => setTimeout(r, 1000))
  }
  throw new Error(`Server did not become ready within ${timeoutMs / 1000}s`)
}

async function stabilisePage(page: Page): Promise<void> {
  await page.evaluate(() => (document as Document & { fonts: { ready: Promise<unknown> } }).fonts.ready)
  await page.addStyleTag({ content: STABILISE_CSS })
  await page.waitForTimeout(300)
}

async function captureMatrix(runDir: string): Promise<void> {
  console.log(`\n  Capturing matrix → ${runDir}`)
  mkdirSync(runDir, { recursive: true })

  const browser = await chromium.launch()
  try {
    for (const entry of PAGE_MATRIX) {
      console.log(`    ${entry.id} ...`)
      const context = await browser.newContext({
        viewport: entry.viewport,
        colorScheme: entry.colorScheme,
        extraHTTPHeaders: entry.authenticated
          ? { Authorization: E2E_AUTHORIZATION }
          : {},
      })
      const page = await context.newPage()
      try {
        await page.goto(`${BASE_URL}${entry.path}`, { waitUntil: 'networkidle', timeout: 60_000 })
        await stabilisePage(page)
        if (entry.pinState) {
          await entry.pinState(page)
          await page.waitForTimeout(200)
        }
        const screenshotPath = path.join(runDir, `${entry.id}.png`)
        await page.screenshot({ path: screenshotPath, type: 'png', fullPage: false })
      }
      catch (err) {
        console.error(`    FAILED ${entry.id}: ${err}`)
        throw err
      }
      finally {
        await context.close()
      }
    }
  }
  finally {
    await browser.close()
  }
  console.log(`  Done (${PAGE_MATRIX.length} pages).`)
}

async function main(): Promise<void> {
  const { archiveDir, outDir } = parseArgs()
  console.log('=== Visual baseline comparison harness (slice 04) ===')
  console.log(`  Archive:  ${archiveDir}`)
  console.log(`  Out dir:  ${outDir}`)
  console.log(`  Port:     ${E2E_PORT}`)
  console.log(`  Base URL: ${BASE_URL}`)

  const manifestPath = path.join(archiveDir, 'manifest.json')
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as BaselineManifest
  const threshold = manifest.threshold.threshold
  console.log(`  Threshold from manifest: ${(threshold * 100).toFixed(4)}%`)

  await killPort(E2E_PORT)

  console.log('\n--- Starting e2e server ---')
  const serverProc = startServer()
  try {
    await waitForServer(BASE_URL)
    await captureMatrix(outDir)

    console.log('\n--- Diffing against baseline ---')
    const diffs: PageDiffResult[] = []
    for (const entry of PAGE_MATRIX) {
      const baseline = path.join(archiveDir, 'screenshots', `${entry.id}.png`)
      const candidate = path.join(outDir, `${entry.id}.png`)
      const diff = diffScreenshots(baseline, candidate, entry.id)
      diffs.push(diff)
      console.log(formatDiffResult(diff))
    }

    const passed = verifyAgainstThreshold(diffs, threshold)
    console.log(`\n  Comparison ${passed ? 'PASSED' : 'FAILED'} (threshold: ${(threshold * 100).toFixed(4)}%)`)

    writeFileSync(
      path.join(outDir, 'comparison.json'),
      JSON.stringify({ passed, threshold, diffs }, null, 2),
    )

    if (!passed) {
      console.error('\n⚠️  Comparison FAILED — at least one page exceeds the calibrated threshold!')
      process.exitCode = 1
    }
  }
  finally {
    console.log('\n--- Shutting down server ---')
    try {
      serverProc.kill('SIGTERM')
      await new Promise(r => setTimeout(r, 3000))
      if (!serverProc.killed) {
        serverProc.kill('SIGKILL')
      }
    }
    catch {
      // best-effort
    }
    await killPort(E2E_PORT)
    console.log('  Server stopped.')
  }
}

main().catch((err) => {
  console.error('FATAL:', err)
  process.exit(1)
})
