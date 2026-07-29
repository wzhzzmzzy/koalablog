/**
 * Shared server lifecycle and matrix-capture runner for the visual baseline
 * harness. capture.ts (baseline generation) and compare.ts (acceptance
 * comparison) both use this module so the two flows cannot drift apart.
 */

import type { Buffer } from 'node:buffer'
import { type ChildProcess, spawn } from 'node:child_process'
import { mkdirSync, rmSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { chromium, type Page } from '@playwright/test'
import { BASE_URL, E2E_AUTHORIZATION, E2E_PORT, PAGE_MATRIX, STABILISE_CSS } from './matrix'

export const REPO_ROOT = path.resolve(import.meta.dirname, '..', '..')

/*
 * The durable acceptance archive lives in user Application Support, not
 * /private/tmp — tmp cleaners and accidental re-runs must not be able to
 * destroy the baseline that later slices verify against.
 */
export const DEFAULT_ARCHIVE = path.join(os.homedir(), 'Library', 'Application Support', 'koalablog', 'visual-baseline')

/*
 * capture.ts removes only the outputs it owns before regenerating them, so
 * foreign files in the archive (QA scripts, probe dumps, refresh notes) and
 * unrelated directories survive a re-capture.
 */
export function cleanOwnedOutputs(archiveDir: string): void {
  const owned = [
    'screenshots',
    'calibration',
    'verification',
    'comparison',
    'manifest.json',
    'calibration.json',
    'verification.json',
  ]
  for (const entry of owned) {
    rmSync(path.join(archiveDir, entry), { recursive: true, force: true })
  }
}

export async function killPort(port: number): Promise<void> {
  try {
    // macOS lsof
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

export function startServer(): ChildProcess {
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

export async function waitForServer(baseUrl: string, timeoutMs = 180_000): Promise<void> {
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

export async function stopServer(proc: ChildProcess): Promise<void> {
  console.log('\n--- Shutting down server ---')
  try {
    proc.kill('SIGTERM')
    // Give it a few seconds to shut down gracefully, then force kill.
    await new Promise(r => setTimeout(r, 3000))
    if (!proc.killed) {
      proc.kill('SIGKILL')
    }
  }
  catch {
    // best-effort
  }
  await killPort(E2E_PORT)
  console.log('  Server stopped.')
}

export async function stabilisePage(page: Page): Promise<void> {
  // Wait for fonts to be loaded.
  await page.evaluate(() => (document as Document & { fonts: { ready: Promise<unknown> } }).fonts.ready)
  // Inject CSS to disable animations, transitions, and caret blink.
  await page.addStyleTag({ content: STABILISE_CSS })
  // Small settle delay for the CSS to take effect.
  await page.waitForTimeout(300)
}

export async function captureMatrix(runDir: string): Promise<void> {
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
          // Re-stabilise after pinState interactions.
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
