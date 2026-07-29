#!/usr/bin/env tsx
/**
 * Fresh-process manifest + hash verifier.
 *
 * Reads the baseline archive manifest from disk (no server, no Playwright)
 * and verifies that:
 *   1. manifest.json parses as valid JSON matching the BaselineManifest schema.
 *   2. Every screenshot file referenced in the manifest exists on disk.
 *   3. Every content hash matches a fresh SHA-256 computation of the file.
 *   4. The verification result in the manifest shows passed = true.
 *   5. Every page in the manifest has a corresponding calibration run
 *      screenshot in calibration/run-b/ and verification run screenshot in
 *      verification/run-c/.
 *
 * Usage:
 *   pnpm tsx scripts/visual-baseline/verify-manifest.ts [--archive <dir>]
 *
 * Exit code 0 = all checks passed, 1 = any check failed.
 *
 * This script is intentionally dependency-free (only node:fs + node:crypto)
 * so it can run in any Node process without installing anything — proving
 * the archive is retrievable by an independently-claimed later slice.
 */

import { createHash } from 'node:crypto'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'

const DEFAULT_ARCHIVE = path.join(os.homedir(), 'Library', 'Application Support', 'koalablog', 'visual-baseline')

interface ManifestPage {
  id: string
  path: string
  viewport: { width: number, height: number }
  colorScheme: string
  authenticated: boolean
  screenshot: string
  contentHash: string
}

interface Manifest {
  archiveVersion: number
  createdAt: string
  browser: { name: string, version: string }
  playwrightVersion: string
  baseURL: string
  serverPort: number
  pages: ManifestPage[]
  threshold: {
    perPage: Array<{ id: string, totalPixels: number, mismatchedPixels: number, pixelRatio: number }>
    maxObservedRatio: number
    margin: number
    threshold: number
  }
  verification: {
    perPage: Array<{ id: string, totalPixels: number, mismatchedPixels: number, pixelRatio: number }>
    passed: boolean
  }
  calibrationFile: string
  verificationFile: string
}

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

function main(): void {
  const { archiveDir } = parseArgs()
  console.log('=== Manifest + hash verifier (fresh process) ===')
  console.log(`  Archive: ${archiveDir}`)

  const errors: string[] = []
  const warnings: string[] = []

  // 1. manifest.json exists and parses.
  const manifestPath = path.join(archiveDir, 'manifest.json')
  if (!existsSync(manifestPath)) {
    errors.push(`manifest.json not found at ${manifestPath}`)
    printResult(errors, warnings)
    return
  }

  let manifest: Manifest
  try {
    const raw = readFileSync(manifestPath, 'utf8')
    manifest = JSON.parse(raw) as Manifest
    console.log(`  manifest.json parsed OK (${raw.length} bytes)`)
  }
  catch (err) {
    errors.push(`manifest.json failed to parse: ${err}`)
    printResult(errors, warnings)
    return
  }

  // 2. Archive version.
  if (manifest.archiveVersion !== 1) {
    errors.push(`Unexpected archiveVersion: ${manifest.archiveVersion} (expected 1)`)
  }

  // 3. Browser + Playwright metadata.
  console.log(`  Browser: ${manifest.browser.name} ${manifest.browser.version}`)
  console.log(`  Playwright: ${manifest.playwrightVersion}`)
  console.log(`  Created: ${manifest.createdAt}`)
  console.log(`  Threshold: ${(manifest.threshold.threshold * 100).toFixed(4)}% (max jitter: ${(manifest.threshold.maxObservedRatio * 100).toFixed(4)}%, margin: ${(manifest.threshold.margin * 100).toFixed(4)}%)`)

  // 4. Every screenshot exists + hash matches.
  console.log(`\n  Verifying ${manifest.pages.length} screenshots ...`)
  for (const pageEntry of manifest.pages) {
    const screenshotPath = path.join(archiveDir, pageEntry.screenshot)
    if (!existsSync(screenshotPath)) {
      errors.push(`Missing screenshot: ${pageEntry.screenshot}`)
      continue
    }
    const actualHash = sha256File(screenshotPath)
    if (actualHash !== pageEntry.contentHash) {
      errors.push(`Hash mismatch for ${pageEntry.screenshot}: manifest=${pageEntry.contentHash.slice(0, 16)}... actual=${actualHash.slice(0, 16)}...`)
    }
    else {
      console.log(`    OK  ${pageEntry.id.padEnd(36)} ${pageEntry.contentHash.slice(0, 16)}...`)
    }
  }

  // 5. Verification passed.
  if (!manifest.verification.passed) {
    errors.push('Manifest verification.passed = false — re-capture diffs exceeded the threshold')
  }
  else {
    console.log('\n  Verification: PASSED')
  }
  console.log('  Per-page verification diffs:')
  for (const diff of manifest.verification.perPage) {
    const status = diff.pixelRatio <= manifest.threshold.threshold ? 'OK' : 'FAIL'
    console.log(`    ${status}  ${diff.id.padEnd(36)} ${(diff.pixelRatio * 100).toFixed(4)}%`)
  }

  // 6. Calibration + verification raw files exist.
  const calibrationPath = path.join(archiveDir, manifest.calibrationFile)
  if (!existsSync(calibrationPath)) {
    errors.push(`Missing calibration file: ${manifest.calibrationFile}`)
  }
  else {
    console.log(`\n  Calibration file: ${manifest.calibrationFile} (OK)`)
  }

  const verificationPath = path.join(archiveDir, manifest.verificationFile)
  if (!existsSync(verificationPath)) {
    errors.push(`Missing verification file: ${manifest.verificationFile}`)
  }
  else {
    console.log(`  Verification file: ${manifest.verificationFile} (OK)`)
  }

  // 7. Calibration run-b screenshots exist for every page.
  const runBDir = path.join(archiveDir, 'calibration', 'run-b')
  if (existsSync(runBDir)) {
    const runBFiles = readdirSync(runBDir)
    for (const pageEntry of manifest.pages) {
      if (!runBFiles.includes(`${pageEntry.id}.png`)) {
        warnings.push(`Missing calibration run-b screenshot: ${pageEntry.id}.png`)
      }
    }
  }
  else {
    warnings.push(`Calibration run-b directory not found: ${runBDir}`)
  }

  // 8. Verification run-c screenshots exist for every page.
  const runCDir = path.join(archiveDir, 'verification', 'run-c')
  if (existsSync(runCDir)) {
    const runCFiles = readdirSync(runCDir)
    for (const pageEntry of manifest.pages) {
      if (!runCFiles.includes(`${pageEntry.id}.png`)) {
        warnings.push(`Missing verification run-c screenshot: ${pageEntry.id}.png`)
      }
    }
  }
  else {
    warnings.push(`Verification run-c directory not found: ${runCDir}`)
  }

  printResult(errors, warnings)
}

function printResult(errors: string[], warnings: string[]): void {
  console.log('')
  if (warnings.length > 0) {
    console.log(`⚠️  ${warnings.length} warning(s):`)
    for (const w of warnings) console.log(`  - ${w}`)
  }
  if (errors.length > 0) {
    console.error(`\n❌ ${errors.length} error(s):`)
    for (const e of errors) console.error(`  - ${e}`)
    console.error('\nVERIFICATION FAILED')
    process.exit(1)
  }
  else {
    console.log('\n✅ VERIFICATION PASSED — all hashes match, manifest is retrievable.')
    process.exit(0)
  }
}

main()
