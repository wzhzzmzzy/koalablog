import process from 'node:process'

function encodedPath(path) {
  return path.split('/').map(segment => encodeURIComponent(segment)).join('/')
}

export class SyncClientError extends Error {
  constructor(message, status) {
    super(message)
    this.name = 'SyncClientError'
    this.status = status
  }
}

export class KoalaSyncClient {
  constructor({ url = process.env.KOALABLOG_URL, token = process.env.KOALABLOG_BEARER_TOKEN, fetch: fetchImpl = globalThis.fetch } = {}) {
    if (!url)
      throw new Error('KOALABLOG_URL is required for synchronization')
    if (!token)
      throw new Error('KOALABLOG_BEARER_TOKEN is required for synchronization')
    if (typeof fetchImpl !== 'function')
      throw new Error('A Fetch implementation is required for synchronization')
    this.baseUrl = new URL(url).toString().replace(/\/$/, '')
    this.token = token
    this.fetch = fetchImpl
  }

  async request(path, options = {}) {
    const headers = new Headers(options.headers)
    headers.set('Authorization', `Bearer ${this.token}`)
    const response = await this.fetch(`${this.baseUrl}${path}`, { ...options, headers })
    if (!response.ok) {
      let message = `${response.status} ${response.statusText}`.trim()
      try {
        const body = await response.json()
        message = typeof body?.error === 'string' ? body.error : message
      }
      catch {}
      throw new SyncClientError(message, response.status)
    }
    return response
  }

  async json(path, options) {
    return (await this.request(path, options)).json()
  }

  manifest() {
    return this.json('/api/sync/manifest')
  }

  async getFile(id) {
    return (await this.json(`/api/sync/files/${id}`)).file
  }

  async createFile(input) {
    return (await this.json('/api/sync/files', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    })).file
  }

  async updateFile(id, input) {
    return (await this.json(`/api/sync/files/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    })).file
  }

  deleteFile(id, baseRevision) {
    return this.json(`/api/sync/files/${id}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ baseRevision }),
    })
  }

  async getAttachment(path) {
    const response = await this.request(`/api/sync/attachments/${encodedPath(path)}`)
    return new Uint8Array(await response.arrayBuffer())
  }

  putAttachment(path, content, contentType = 'application/octet-stream') {
    return this.json(`/api/sync/attachments/${encodedPath(path)}`, {
      method: 'PUT',
      headers: { 'Content-Type': contentType },
      body: content,
    })
  }

  deleteAttachment(path) {
    return this.json(`/api/sync/attachments/${encodedPath(path)}`, { method: 'DELETE' })
  }
}
