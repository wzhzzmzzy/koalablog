export type SvelteDiagnosticSeverity = 'error' | 'warning'

export interface SvelteDiagnostic {
  message: string
  severity: SvelteDiagnosticSeverity
  start: number
  end: number
  code?: string
}

export interface SvelteDiagnoseRequest {
  type: 'diagnose'
  requestId: number
  source: string
}

export interface SvelteBuildRequest {
  type: 'build'
  requestId: number
  source: string
}

export type SvelteWorkerRequest = SvelteDiagnoseRequest | SvelteBuildRequest

export interface SvelteDiagnoseResult {
  type: 'diagnose-result'
  requestId: number
  diagnostics: SvelteDiagnostic[]
}

export interface SvelteBuildSuccess {
  type: 'build-success'
  requestId: number
  javascript: string
  css: string
  warnings: SvelteDiagnostic[]
  dependencies: SvelteDependencyManifestEntry[]
}

export interface SvelteBuildError {
  type: 'build-error'
  requestId: number
  error: SvelteDiagnostic
  warnings: SvelteDiagnostic[]
}

export interface SvelteCompileSuccess {
  ok: true
  javascript: string
  css: string
  warnings: SvelteDiagnostic[]
}

export interface SvelteDependencyManifestEntry {
  url: string
  bytes: number
  sha256: string
}

export interface SvelteArtifactInputV1 {
  schemaVersion: 1
  renderer: 'svelte'
  svelteVersion: string
  unocssVersion: string
  unocssConfigHash: string
  sourceHash: string
  dependencies: SvelteDependencyManifestEntry[]
  javascript: string
  css: string
  snapshotHtml: string
}

export interface SvelteArtifactHashes {
  artifactHash: string
  cssResourceHash: string
  javascriptResourceHash: string
}

export interface SvelteCompileFailure {
  ok: false
  error: SvelteDiagnostic
  warnings: SvelteDiagnostic[]
}

export type SvelteCompileResult = SvelteCompileSuccess | SvelteCompileFailure

export type SvelteWorkerResponse = SvelteDiagnoseResult | SvelteBuildSuccess | SvelteBuildError
