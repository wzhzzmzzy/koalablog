/**
 * Shared types for the visual baseline harness.
 *
 * These types are the contract between the capture script, the diff logic,
 * the manifest, and the post-migration acceptance slice (06).  An independently
 * claimed later slice must be able to rebuild the full capture matrix from the
 * manifest alone, so every field that affects rendering is persisted here.
 */

/** CSS scheme to emulate in Playwright. */
export type ColorScheme = 'light' | 'dark'

/** A single screenshot specification in the page matrix. */
export interface MatrixEntry {
  /** Stable identifier used as the screenshot filename stem. */
  id: string
  /** Path on the server (relative to baseURL) e.g. "/", "/post/hello". */
  path: string
  /** Viewport size in CSS pixels. */
  viewport: { width: number, height: number }
  /** Emulated prefers-color-scheme. */
  colorScheme: ColorScheme
  /** Whether this page requires an authenticated (admin) session. */
  authenticated: boolean
  /**
   * Optional page-state pinning hook.  Receives a Playwright Page that has
   * already navigated to `path` and waited for networkidle.  The hook may
   * interact with the page (click buttons, focus elements, inject CSS) to
   * stabilise the visual state before capture.
   */
  pinState?: (page: import('@playwright/test').Page) => Promise<void>
}

/** Per-page diff result between two screenshot captures. */
export interface PageDiffResult {
  /** Matrix entry id. */
  id: string
  /** Total pixels in the image. */
  totalPixels: number
  /** Number of mismatched pixels reported by pixelmatch. */
  mismatchedPixels: number
  /** mismatchedPixels / totalPixels. */
  pixelRatio: number
}

/** Threshold derivation record — persisted for auditability. */
export interface ThresholdCalibration {
  /** Per-page diff measurements from calibration run A vs run B. */
  perPage: PageDiffResult[]
  /** The maximum pixelRatio observed across all pages in calibration. */
  maxObservedRatio: number
  /** Absolute margin added on top of maxObservedRatio. */
  margin: number
  /** Final calibrated threshold (a screenshot passes acceptance when its
   *  pixelRatio against the baseline is ≤ this value). */
  threshold: number
}

/** Verification re-capture diff record — persisted for auditability. */
export interface VerificationResult {
  /** Per-page diff measurements from baseline (run A) vs re-capture (run C). */
  perPage: PageDiffResult[]
  /** Whether every page's pixelRatio is ≤ the calibrated threshold. */
  passed: boolean
}

/** A single page entry in the durable manifest. */
export interface ManifestPage {
  id: string
  path: string
  viewport: { width: number, height: number }
  colorScheme: ColorScheme
  authenticated: boolean
  /** Relative path inside the archive directory. */
  screenshot: string
  /** SHA-256 content hash of the screenshot file. */
  contentHash: string
}

/** The top-level manifest persisted alongside the baseline screenshots. */
export interface BaselineManifest {
  /** Manifest schema version for forward compatibility. */
  archiveVersion: 1
  /** ISO timestamp of baseline capture. */
  createdAt: string
  /** Playwright / browser metadata for reproducibility. */
  browser: {
    name: string
    version: string
  }
  playwrightVersion: string
  /** Base URL the baseline was captured against. */
  baseURL: string
  /** Server port used (E2E_PORT). */
  serverPort: number
  /** The full page matrix used — a later slice can re-capture from this. */
  pages: ManifestPage[]
  /** Calibrated threshold data. */
  threshold: ThresholdCalibration
  /** Re-capture verification data. */
  verification: VerificationResult
  /** Relative path to the raw calibration measurements file. */
  calibrationFile: string
  /** Relative path to the verification measurements file. */
  verificationFile: string
}
