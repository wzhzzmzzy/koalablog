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
 *   --archive  ~/Library/Application Support/koalablog/visual-baseline
 *   --out      <archive>/comparison                     (where new captures go)
 *
 * Exit code 0 = every page under threshold, 1 = any page at/above threshold.
 *
 * This script reuses the shared matrix + diff + runner modules (slice 06 also
 * depends on them) but is a separate CLI so capture.ts's public API stays stable.
 */

import type { BaselineManifest, PageDiffResult } from './types'
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { diffScreenshots, formatDiffResult, verifyAgainstThreshold } from './diff'
import { BASE_URL, E2E_PORT, PAGE_MATRIX } from './matrix'
import { captureMatrix, DEFAULT_ARCHIVE, killPort, startServer, stopServer, waitForServer } from './runner'

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
    await stopServer(serverProc)
  }
}

main().catch((err) => {
  console.error('FATAL:', err)
  process.exit(1)
})
