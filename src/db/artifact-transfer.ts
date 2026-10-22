import type { BaseSQLiteDatabase } from 'drizzle-orm/sqlite-core'
import type { ArtifactStorageMode } from '@/lib/svelte/artifact-storage'
import { and, eq, gt, sql } from 'drizzle-orm'
import { serializeJavascriptResource, sha256Hex } from '@/lib/svelte/artifact-hash'
import { artifactLimitViolation } from '@/lib/svelte/artifact-limits'
import { artifactObjectKey, storeArtifactResources, verifyArtifactResource } from '@/lib/svelte/artifact-storage'
import { connectDB } from '.'
import { markdown, markdownRender } from './schema'

export async function listArtifactStorage(env: Env, ownerId: number, afterId = 0, schemaReady = true, fileId?: number) {
  const db: BaseSQLiteDatabase<'async', unknown, typeof import('./schema')> = connectDB(env)
  return db.select({
    fileId: markdown.id,
    path: markdown.path,
    deletedAt: markdown.deletedAt,
    sourceHash: markdown.sourceHash,
    deployedSourceHash: markdownRender.sourceHash,
    deployedAt: markdownRender.updatedAt,
    artifactHash: markdownRender.artifactHash,
    mode: schemaReady
      ? sql<ArtifactStorageMode | null>`CASE WHEN ${markdownRender.fileId} IS NULL THEN NULL WHEN ${markdownRender.javascriptKey} IS NULL THEN 'd1' ELSE 'r2' END`
      : sql<ArtifactStorageMode | null>`CASE WHEN ${markdownRender.fileId} IS NULL THEN NULL ELSE 'd1' END`,
  }).from(markdown).leftJoin(markdownRender, eq(markdown.id, markdownRender.fileId)).where(and(
    eq(markdown.userId, ownerId),
    eq(markdown.renderer, 'svelte'),
    fileId === undefined ? undefined : eq(markdown.id, fileId),
    gt(markdown.id, afterId),
  )).orderBy(markdown.id).limit(50)
}

export async function transferArtifactStorage(env: Env, input: { fileId: number, ownerId: number, artifactHash: string, from: ArtifactStorageMode, to: ArtifactStorageMode }) {
  const db: BaseSQLiteDatabase<'async', unknown, typeof import('./schema')> = connectDB(env)
  const [record] = await db.select({ artifact: markdownRender }).from(markdownRender).innerJoin(markdown, eq(markdown.id, markdownRender.fileId)).where(and(
    eq(markdown.id, input.fileId),
    eq(markdown.userId, input.ownerId),
    eq(markdownRender.artifactHash, input.artifactHash),
    sql`(${markdownRender.javascriptKey} IS NOT NULL) = ${input.from === 'r2' ? 1 : 0}`,
  ))
  if (!record)
    return { status: 'conflict' as const }
  if (input.from === input.to)
    return { status: 'unchanged' as const }
  const artifact = record.artifact
  if (Boolean(artifact.javascriptKey) !== Boolean(artifact.cssKey))
    throw new Error('Incomplete Artifact storage references')
  let { javascript, css } = artifact
  if (input.from === 'r2') {
    if (artifact.javascriptKey !== artifactObjectKey(input.fileId, artifact.javascriptResourceHash, 'javascript')
      || artifact.cssKey !== artifactObjectKey(input.fileId, artifact.cssResourceHash, 'css')) {
      throw new Error('Invalid Artifact object references')
    }
    const module = await verifyArtifactResource(env, artifact.javascriptKey, artifact.javascriptResourceHash)
    css = await verifyArtifactResource(env, artifact.cssKey, artifact.cssResourceHash)
    const prefix = 'const artifact = '
    const suffix = serializeJavascriptResource('').slice(prefix.length)
    if (!module.startsWith(prefix) || !module.endsWith(suffix))
      throw new Error('Unsupported Artifact module representation')
    javascript = module.slice(prefix.length, -suffix.length)
  }
  if (await sha256Hex(serializeJavascriptResource(javascript)) !== artifact.javascriptResourceHash || await sha256Hex(css) !== artifact.cssResourceHash)
    throw new Error('Artifact resource hashes do not match; no data was changed')
  if (artifactLimitViolation({ ...artifact, schemaVersion: 2, renderer: 'svelte', javascript, css }))
    throw new Error('Artifact exceeds the supported storage limits')
  const resources = await storeArtifactResources(env, { ...artifact, javascript, css }, input.to)
  if (input.to === 'r2') {
    await verifyArtifactResource(env, resources.javascriptKey!, artifact.javascriptResourceHash)
    await verifyArtifactResource(env, resources.cssKey!, artifact.cssResourceHash)
  }
  const rows = await db.update(markdownRender).set(resources).where(and(
    eq(markdownRender.fileId, input.fileId),
    eq(markdownRender.artifactHash, input.artifactHash),
    eq(markdownRender.sourceHash, artifact.sourceHash),
    sql`(${markdownRender.javascriptKey} IS NOT NULL) = ${input.from === 'r2' ? 1 : 0}`,
    sql`EXISTS (SELECT 1 FROM markdown WHERE id = ${input.fileId} AND userId = ${input.ownerId})`,
  )).returning({ fileId: markdownRender.fileId })
  return { status: rows.length ? 'migrated' as const : 'conflict' as const }
}
