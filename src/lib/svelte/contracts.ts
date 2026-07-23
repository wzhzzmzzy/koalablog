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
}

export interface SvelteBuildError {
  type: 'build-error'
  requestId: number
  error: SvelteDiagnostic
  warnings: SvelteDiagnostic[]
}

export type SvelteWorkerResponse = SvelteDiagnoseResult | SvelteBuildSuccess | SvelteBuildError
