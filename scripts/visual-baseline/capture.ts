#!/usr/bin/env tsx
/**
 * Visual baseline capture harness.
 *
 * Boots the e2e server on E2E_PORT=4333, captures the full page matrix three
 * times (A, B, C) under pinned conditions, computes calibration diffs
 * (A vs B), derives a threshold from the measured jitter, computes
 * verification diffs (A vs C), and writes the durable baseline archive.
 *
 * Usage:
 *   pnpm tsx scripts/visual-baseline/capture.ts [--archive <dir>]
 *
 * Defaults:
 *   --archive  ~/Library/Application Support/koalablog/visual-baseline
 *
 * The archive is the acceptance anchor for slices 04 and 06 of the
 * UnoCSS → Tailwind migration.  It must be reproducible by a different
 * agent from the manifest alone.
 */

import type { BaselineManifest, ManifestPage, PageDiffResult } from './types'
import { createHash } from 'node:crypto'
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { chromium } from '@playwright/test'
import { deriveThreshold, diffScreenshots, formatDiffResult, verifyAgainstThreshold } from './diff'
import { BASE_URL, E2E_PORT, PAGE_MATRIX } from './matrix'
import { captureMatrix, cleanOwnedOutputs, DEFAULT_ARCHIVE, killPort, startServer, stopServer, waitForServer } from './runner'

function parseArgs(): { archiveDir: string } {
  const args = process.argv.slice(2)
  let archiveDir = DEFAULT_ARCHIVE
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--archive' && args[i + 1]) {
      archiveDir = args[i + 1]
      i++
    }
  }
  return { archiveDir }
}

function sha256File(filePath: string): string {
  const content = readFileSync(filePath)
  return createHash('sha256').update(content).digest('hex')
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const { archiveDir } = parseArgs()
  console.log('=== Visual baseline capture harness ===')
  console.log(`  Archive:  ${archiveDir}`)
  console.log(`  Port:     ${E2E_PORT}`)
  console.log(`  Base URL: ${BASE_URL}`)
  console.log(`  Matrix:   ${PAGE_MATRIX.length} entries`)

  // Kill anything on our port first.
  await killPort(E2E_PORT)

  // Start the e2e server.
  console.log('\n--- Starting e2e server ---')
  const serverProc = startServer()
  try {
    await waitForServer(BASE_URL)

    // Get browser + Playwright versions.
    const browser = await chromium.launch()
    const browserVersion = browser.version()
    await browser.close()
    const { createRequire } = await import('node:module')
    const require = createRequire(import.meta.url)
    const playwrightVersion = require('@playwright/test/package.json').version as string
    console.log(`  Browser:    ${browserVersion}`)
    console.log(`  Playwright: ${playwrightVersion}`)

    // Prepare archive directory structure.
    const screenshotsDir = path.join(archiveDir, 'screenshots')
    const calibrationDir = path.join(archiveDir, 'calibration')
    const runADir = path.join(calibrationDir, 'run-a')
    const runBDir = path.join(calibrationDir, 'run-b')
    const verificationDir = path.join(archiveDir, 'verification')
    const runCDir = path.join(verificationDir, 'run-c')

    cleanOwnedOutputs(archiveDir)
    mkdirSync(screenshotsDir, { recursive: true })
    mkdirSync(runADir, { recursive: true })
    mkdirSync(runBDir, { recursive: true })
    mkdirSync(runCDir, { recursive: true })

    // --- Run A (baseline + calibration capture 1) ---
    console.log('\n--- Run A (baseline + calibration 1) ---')
    await captureMatrix(runADir)

    // --- Run B (calibration capture 2) ---
    console.log('\n--- Run B (calibration capture 2) ---')
    await captureMatrix(runBDir)

    // --- Run C (verification re-capture) ---
    console.log('\n--- Run C (verification re-capture) ---')
    await captureMatrix(runCDir)

    // --- Calibration: diff A vs B ---
    console.log('\n--- Calibration: A vs B ---')
    const calibrationDiffs: PageDiffResult[] = []
    for (const entry of PAGE_MATRIX) {
      const a = path.join(runADir, `${entry.id}.png`)
      const b = path.join(runBDir, `${entry.id}.png`)
      const diff = diffScreenshots(a, b, entry.id)
      calibrationDiffs.push(diff)
      console.log(formatDiffResult(diff))
    }
    const threshold = deriveThreshold(calibrationDiffs)
    console.log(`\n  Max observed ratio: ${(threshold.maxObservedRatio * 100).toFixed(4)}%`)
    console.log(`  Margin:             ${(threshold.margin * 100).toFixed(4)}%`)
    console.log(`  Calibrated threshold: ${(threshold.threshold * 100).toFixed(4)}%`)

    // --- Verification: diff A vs C ---
    console.log('\n--- Verification: A vs C ---')
    const verificationDiffs: PageDiffResult[] = []
    for (const entry of PAGE_MATRIX) {
      const a = path.join(runADir, `${entry.id}.png`)
      const c = path.join(runCDir, `${entry.id}.png`)
      const diff = diffScreenshots(a, c, entry.id)
      verificationDiffs.push(diff)
      console.log(formatDiffResult(diff))
    }
    const verificationPassed = verifyAgainstThreshold(verificationDiffs, threshold.threshold)
    console.log(`\n  Verification ${verificationPassed ? 'PASSED' : 'FAILED'} (threshold: ${(threshold.threshold * 100).toFixed(4)}%)`)

    // --- Copy run A → screenshots/ (the canonical baseline) ---
    console.log('\n--- Writing baseline screenshots ---')
    const manifestPages: ManifestPage[] = []
    for (const entry of PAGE_MATRIX) {
      const src = path.join(runADir, `${entry.id}.png`)
      const dst = path.join(screenshotsDir, `${entry.id}.png`)
      copyFileSync(src, dst)
      const hash = sha256File(dst)
      manifestPages.push({
        id: entry.id,
        path: entry.path,
        viewport: entry.viewport,
        colorScheme: entry.colorScheme,
        authenticated: entry.authenticated,
        screenshot: `screenshots/${entry.id}.png`,
        contentHash: hash,
      })
    }

    // --- Write calibration + verification JSON ---
    const calibrationFile = 'calibration.json'
    const verificationFile = 'verification.json'
    writeFileSync(
      path.join(archiveDir, calibrationFile),
      JSON.stringify({ threshold, diffs: calibrationDiffs }, null, 2),
    )
    writeFileSync(
      path.join(archiveDir, verificationFile),
      JSON.stringify({ passed: verificationPassed, diffs: verificationDiffs }, null, 2),
    )

    // --- Write manifest ---
    const manifest: BaselineManifest = {
      archiveVersion: 1,
      createdAt: new Date().toISOString(),
      browser: {
        name: 'chromium',
        version: browserVersion,
      },
      playwrightVersion,
      baseURL: BASE_URL,
      serverPort: E2E_PORT,
      pages: manifestPages,
      threshold,
      verification: {
        perPage: verificationDiffs,
        passed: verificationPassed,
      },
      calibrationFile,
      verificationFile,
    }
    writeFileSync(
      path.join(archiveDir, 'manifest.json'),
      JSON.stringify(manifest, null, 2),
    )

    console.log('\n=== Archive written ===')
    console.log(`  ${archiveDir}/manifest.json`)
    console.log(`  ${archiveDir}/${calibrationFile}`)
    console.log(`  ${archiveDir}/${verificationFile}`)
    console.log(`  ${archiveDir}/screenshots/ (${manifestPages.length} files)`)
    console.log(`  ${archiveDir}/calibration/run-a/ + run-b/`)
    console.log(`  ${archiveDir}/verification/run-c/`)
    console.log(`\n  Threshold: ${(threshold.threshold * 100).toFixed(4)}%`)
    console.log(`  Verification: ${verificationPassed ? 'PASSED' : 'FAILED'}`)

    if (!verificationPassed) {
      console.error('\n⚠️  Verification FAILED — re-capture diffs exceed calibrated threshold!')
      process.exitCode = 1
    }
  }
  finally {
    await stopServer(serverProc)
  }
}

main().catch((err) => {
  console.error('FATAL:', err)
  process.exit(1)
})
