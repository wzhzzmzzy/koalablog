import type { SvelteArtifactHashes, SvelteArtifactInputV1 } from '@/lib/svelte/contracts'
import { and, eq, isNull } from 'drizzle-orm'
import { connectDB } from '.'
import { markdown, markdownRender } from './schema'

export type StoredRenderArtifact = SvelteArtifactInputV1 & SvelteArtifactHashes & { fileId: number }

export async function replaceRenderArtifact(env: Env, artifact: StoredRenderArtifact) {
  const db = connectDB(env)
  const now = new Date()
  const { fileId, ...replacement } = artifact
  await db.insert(markdownRender).values({ fileId, ...replacement, createdAt: now, updatedAt: now }).onConflictDoUpdate({
    target: markdownRender.fileId,
    set: { ...replacement, updatedAt: now },
  })
  return readRenderArtifact(env, fileId)
}

export function readRenderArtifact(env: Env, fileId: number) {
  return connectDB(env).query.markdownRender.findFirst({ where: eq(markdownRender.fileId, fileId) })
}

export async function readCurrentRenderArtifact(env: Env, fileId: number) {
  const [current] = await connectDB(env).select({ artifact: markdownRender }).from(markdownRender).innerJoin(
    markdown,
    eq(markdown.id, markdownRender.fileId),
  ).where(and(
    eq(markdownRender.fileId, fileId),
    eq(markdownRender.renderer, 'svelte'),
    eq(markdown.renderer, 'svelte'),
    eq(markdown.sourceHash, markdownRender.sourceHash),
    isNull(markdown.deletedAt),
  )).limit(1)
  return current?.artifact
}
