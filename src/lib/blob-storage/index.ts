import { Buffer } from 'node:buffer'
import { eq, inArray } from 'drizzle-orm'
import { connectDB } from '../../db'
import { blobStorage } from '../../db/schema'

export interface BlobObjectMeta {
  key: string
  size: number
  etag?: string
  uploaded: Date
  httpMetadata?: {
    contentType?: string
    contentLanguage?: string
    contentDisposition?: string
    contentEncoding?: string
    cacheControl?: string
  }
  customMetadata?: Record<string, string>
}

export interface BlobObject extends BlobObjectMeta {
  body: ArrayBuffer
}

export interface BlobStorageOptions {
  httpMetadata?: {
    contentType?: string
    contentLanguage?: string
    contentDisposition?: string
    contentEncoding?: string
    cacheControl?: string
  }
  customMetadata?: Record<string, string>
}

export class SQLiteBlobStorage {
  constructor(private env: Env) { }

  async put(key: string, value: File | ArrayBuffer | string, options?: BlobStorageOptions): Promise<void> {
    const db = connectDB(this.env)

    let data: string
    let size: number
    let contentType: string

    if (value instanceof File) {
      const arrayBuffer = await value.arrayBuffer()
      data = Buffer.from(arrayBuffer).toString('base64')
      size = value.size
      contentType = value.type || 'application/octet-stream'
    }
    else if (value instanceof ArrayBuffer) {
      data = Buffer.from(value).toString('base64')
      size = value.byteLength
      contentType = options?.httpMetadata?.contentType || 'application/octet-stream'
    }
    else {
      data = Buffer.from(value).toString('base64')
      size = Buffer.byteLength(value)
      contentType = options?.httpMetadata?.contentType || 'text/plain'
    }

    const existingBlob = await db.query.blobStorage.findFirst({
      where: eq(blobStorage.key, key),
    })

    const blobData = {
      key,
      contentType,
      size,
      data,
      metadata: options?.customMetadata || {},
    }

    if (existingBlob) {
      await db.update(blobStorage)
        .set({
          ...blobData,
          updatedAt: new Date(),
        })
        .where(eq(blobStorage.key, key))
    }
    else {
      await db.insert(blobStorage).values(blobData)
    }
  }

  async get(key: string): Promise<BlobObject | null> {
    const db = connectDB(this.env)

    const blob = await db.query.blobStorage.findFirst({
      where: eq(blobStorage.key, key),
    })

    if (!blob) {
      return null
    }

    return {
      key: blob.key,
      size: blob.size,
      uploaded: blob.uploadedAt,
      httpMetadata: {
        contentType: blob.contentType,
      },
      customMetadata: blob.metadata as Record<string, string> || {},
      body: Buffer.from(blob.data as string, 'base64').buffer,
    }
  }

  async delete(keys: string | string[]): Promise<void> {
    const db = connectDB(this.env)
    const keyArray = Array.isArray(keys) ? keys : [keys]

    await db.delete(blobStorage).where(inArray(blobStorage.key, keyArray))
  }

  async list(options?: { prefix?: string, limit?: number, cursor?: string }): Promise<{
    objects: BlobObjectMeta[]
    truncated: boolean
    cursor?: string
  }> {
    const db = connectDB(this.env)
    const limit = options?.limit || 1000

    const query = db.query.blobStorage.findMany({
      limit: limit + 1, // Get one extra to check if truncated
      orderBy: (blobStorage, { asc }) => [asc(blobStorage.key)],
    })

    const results = await query

    const truncated = results.length > limit
    const objects = results.slice(0, limit).map(blob => ({
      key: blob.key,
      size: blob.size,
      uploaded: blob.uploadedAt,
      httpMetadata: {
        contentType: blob.contentType,
      },
      customMetadata: blob.metadata as Record<string, string> || {},
    }))

    return {
      objects,
      truncated,
      cursor: truncated ? objects[objects.length - 1]?.key : undefined,
    }
  }
}
