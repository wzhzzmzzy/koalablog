/**
 * Attachments Upload API
 *
 * @example
 * const formData = new FormData()
 * formData.append('file', new Blob([buffer], { type: 'image/jpeg' }), 'test.jpg')
 * formData.append('path', '2026/03/2026-03-11-test.jpg')
 *
 * const res = await fetch('http://localhost:4321/api/attachments/upload', {
 *   method: 'POST',
 *   headers: { Authorization: 'Bearer <token>' },
 *   body: formData,
 * })
 * const { accessUrl } = await res.json()
 * // accessUrl: /api/oss/attachments_2026/03/2026-03-11-test.jpg
 */
import type { APIRoute } from 'astro'
import { authInterceptor } from '@/lib/auth'

export const POST: APIRoute = async (ctx) => {
  await authInterceptor(ctx)
  if (ctx.locals.session?.role !== 'admin') {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const formData = await ctx.request.formData()
  const file = formData.get('file')
  const path = formData.get('path')

  if (!file || !(file instanceof File)) {
    return new Response(JSON.stringify({ error: 'Missing or invalid file' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  if (!path || typeof path !== 'string') {
    return new Response(JSON.stringify({ error: 'Missing path parameter' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  if (path.includes('..') || path.startsWith('/')) {
    return new Response(JSON.stringify({ error: 'Invalid path: path traversal detected' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const storageKey = `attachments/${path}`
  const OSS = ctx.locals.OSS || ctx.locals.runtime.env.OSS

  await OSS.put(storageKey, file, {
    httpMetadata: {
      contentType: file.type || 'application/octet-stream',
    },
    customMetadata: {
      uploadedAt: new Date().toISOString(),
      originalName: file.name,
      size: file.size.toString(),
    },
  })

  return new Response(JSON.stringify({
    success: true,
    key: storageKey,
    accessUrl: `/api/oss/attachments_${path}`,
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}