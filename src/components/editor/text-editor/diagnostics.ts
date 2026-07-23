export type TextEditorDiagnosticSeverity = 'error' | 'warning' | 'info' | 'hint'

export interface TextEditorDiagnostic {
  from: number
  to: number
  severity: TextEditorDiagnosticSeverity
  message: string
  source?: string
}

export interface TextEditorDiagnosticUpdate {
  requestId: number
  diagnostics: readonly TextEditorDiagnostic[]
}

export function reconcileTextEditorDiagnostics(
  current: Pick<TextEditorDiagnosticUpdate, 'requestId'> | null,
  next: TextEditorDiagnosticUpdate,
): TextEditorDiagnosticUpdate | null {
  if (current && next.requestId < current.requestId)
    return null
  return {
    requestId: next.requestId,
    diagnostics: next.diagnostics.map(diagnostic => ({ ...diagnostic })),
  }
}
