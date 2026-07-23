export function createDependencyFetchLifecycle() {
  let latestRequestId = 0
  let controller: AbortController | null = null

  function abortedSignal() {
    const aborted = new AbortController()
    aborted.abort()
    return aborted.signal
  }

  return {
    begin(requestId: number) {
      if (requestId <= latestRequestId)
        return abortedSignal()
      controller?.abort()
      latestRequestId = requestId
      controller = new AbortController()
      return controller.signal
    },
    dispose() {
      controller?.abort()
      controller = null
    },
  }
}
