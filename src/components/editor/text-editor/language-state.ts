import type { RendererMode } from '@/lib/files/types'

export interface TextEditorLanguageRequest {
  requestId: number
  renderer: RendererMode
}

export interface TextEditorLanguagePlan {
  latestRequestId: number
  request: TextEditorLanguageRequest | null
}

export function planTextEditorLanguageRequest(
  currentRequestId: number,
  installedRenderer: RendererMode | null,
  nextRenderer: RendererMode,
  stateWasReplaced: boolean,
): TextEditorLanguagePlan {
  const invalidatedRequestId = stateWasReplaced ? currentRequestId + 1 : currentRequestId
  if (installedRenderer === nextRenderer)
    return { latestRequestId: invalidatedRequestId, request: null }
  const requestId = invalidatedRequestId + 1
  return {
    latestRequestId: requestId,
    request: { requestId, renderer: nextRenderer },
  }
}

export function isCurrentTextEditorLanguageRequest(
  request: TextEditorLanguageRequest,
  latestRequestId: number,
  desiredRenderer: RendererMode,
) {
  return request.requestId === latestRequestId && request.renderer === desiredRenderer
}
