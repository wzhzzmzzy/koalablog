interface ObjectResponseInput {
  body: BodyInit
  size: number
  httpEtag?: string
  httpMetadata?: {
    contentType?: string
    contentLanguage?: string
    contentDisposition?: string
    contentEncoding?: string
    cacheControl?: string
    cacheExpiry?: Date
  }
}

export function objectResponse(object: ObjectResponseInput, privateResource = false) {
  const metadata = object.httpMetadata
  const headers = new Headers({
    'Content-Type': metadata?.contentType || 'application/octet-stream',
    'Content-Length': String(object.size),
    'X-Content-Type-Options': 'nosniff',
  })
  for (const [header, value] of [
    ['Content-Language', metadata?.contentLanguage],
    ['Content-Disposition', metadata?.contentDisposition],
    ['Content-Encoding', metadata?.contentEncoding],
    ['Cache-Control', metadata?.cacheControl],
    ['Expires', metadata?.cacheExpiry?.toUTCString()],
  ]) {
    if (value)
      headers.set(header!, value)
  }
  if (privateResource) {
    headers.set('Cache-Control', 'private, no-store')
    headers.delete('Expires')
  }
  else if (object.httpEtag) {
    headers.set('ETag', object.httpEtag)
  }
  const init = { headers, encodeBody: 'manual' as const }
  return new Response(object.body, init)
}
