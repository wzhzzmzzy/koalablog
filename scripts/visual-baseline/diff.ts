/**
 * Pixel-diff and threshold-derivation logic.
 *
 * Uses pixelmatch + pngjs — both are devDependencies added for this harness
 * (the one exception to the no-package.json rule; see issue 02 Comments).
 *
 * All functions are pure (no I/O except readFileSync on PNG files) so they
 * can be unit-tested and reused by the post-migration acceptance slice.
 */

import { readFileSync } from 'node:fs'
import path from 'node:path'
import { PNG } from 'pngjs'
import pixelmatch from 'pixelmatch'
import type { PageDiffResult, ThresholdCalibration } from './types'

/**
 * Read a PNG file into a raw RGBA buffer + dimensions.
 * Throws if the file is not a valid PNG.
 */
function readPng(filePath: string): { data: Buffer, width: number, height: number } {
  const buffer = readFileSync(filePath)
  const png = PNG.sync.read(buffer)
  return { data: png.data, width: png.width, height: png.height }
}

/**
 * Compute the pixel diff between two screenshot files.
 *
 * If the two images have different dimensions (which should never happen
 * under pinned conditions, but can indicate a layout regression), the diff
 * is computed against the smaller common area and the result is flagged with
 * a 100 % mismatch for the excess region.
 *
 * Returns the per-page diff result including total pixels, mismatched pixels,
 * and the mismatched-pixel ratio.
 */
export function diffScreenshots(
  baselinePath: string,
  candidatePath: string,
  id: string,
): PageDiffResult {
  const baseline = readPng(baselinePath)
  const candidate = readPng(candidatePath)

  const width = Math.min(baseline.width, candidate.width)
  const height = Math.min(baseline.height, candidate.height)

  const diffBuffer = Buffer.alloc(width * height * 4)

  const mismatchedPixels = pixelmatch(
    baseline.data,
    candidate.data,
    diffBuffer,
    width,
    height,
    { threshold: 0.1, includeAA: false },
  )

  // If dimensions differ, count the excess area as fully mismatched.
  const baselineTotal = baseline.width * baseline.height
  const candidateTotal = candidate.width * candidate.height
  const commonTotal = width * height

  let totalPixels: number
  let effectiveMismatched: number

  if (baselineTotal === candidateTotal) {
    totalPixels = baselineTotal
    effectiveMismatched = mismatchedPixels
  }
  else {
    // The excess pixels are treated as mismatched.
    const excessPixels = Math.abs(baselineTotal - candidateTotal)
    totalPixels = Math.max(baselineTotal, candidateTotal)
    effectiveMismatched = mismatchedPixels + excessPixels
  }

  return {
    id,
    totalPixels,
    mismatchedPixels: effectiveMismatched,
    pixelRatio: totalPixels > 0 ? effectiveMismatched / totalPixels : 0,
  }
}

/**
 * Derive the calibrated pixel-diff threshold from repeat-capture measurements.
 *
 * Strategy (issue 02): take the full matrix twice under identical conditions
 * with zero code changes, compute per-page pixel diffs, and derive the
 * threshold from the measured jitter.
 *
 * Formula: threshold = maxObservedRatio + margin
 *
 * The margin is a small absolute value (0.002 = 0.2 % of pixels) that
 * provides headroom above the worst observed jitter without being so large
 * that it masks real regressions.  This is deliberately conservative — the
 * raw jitter on a pinned static page should be near zero, so even a small
 * margin gives a meaningful safety net.
 *
 * The threshold is clamped to a minimum of 0.001 (0.1 %) so that a
 * perfectly-stable page still has a non-zero tolerance for sub-pixel
 * rendering differences.
 */
export function deriveThreshold(
  perPage: PageDiffResult[],
  margin = 0.002,
): ThresholdCalibration {
  const maxObservedRatio = perPage.length > 0
    ? Math.max(...perPage.map(r => r.pixelRatio))
    : 0

  const threshold = Math.max(maxObservedRatio + margin, 0.001)

  return {
    perPage,
    maxObservedRatio,
    margin,
    threshold,
  }
}

/**
 * Check whether a verification re-capture passes the calibrated threshold.
 * Every page's pixelRatio must be ≤ the threshold.
 */
export function verifyAgainstThreshold(
  perPage: PageDiffResult[],
  threshold: number,
): boolean {
  return perPage.every(r => r.pixelRatio <= threshold)
}

/**
 * Format a diff result for human-readable console output.
 */
export function formatDiffResult(result: PageDiffResult): string {
  const percentage = (result.pixelRatio * 100).toFixed(4)
  return `  ${result.id.padEnd(36)} ${String(result.mismatchedPixels).padStart(8)} / ${String(result.totalPixels).padStart(10)} px  (${percentage}%)`
}
