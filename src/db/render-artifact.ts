import type { BaseSQLiteDatabase } from 'drizzle-orm/sqlite-core'
import type { SvelteArtifactHashes, SvelteArtifactInputV1 } from '@/lib/svelte/contracts'
import { and, eq, isNull, or, sql } from 'drizzle-orm'
import { type ArtifactAccessInput, decideArtifactAccess } from '@/lib/svelte/artifact-access'
import { deploymentSummary, type DeploymentSummary } from '@/lib/svelte/deployment-status'
import { connectDB } from '.'
import { markdown, markdownRender } from './schema'

export type StoredRenderArtifact = SvelteArtifactInputV1 & SvelteArtifactHashes & { fileId: number }

function affectedRows(result: unknown) {
  if (!result || typeof result !== 'object')
    return 0
  if ('rowsAffected' in result && typeof result.rowsAffected === 'number')
    return result.rowsAffected
  if ('meta' in result && result.meta && typeof result.meta === 'object'
    && 'changes' in result.meta && typeof result.meta.changes === 'number') {
    return result.meta.changes
  }
  return 0
}

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

type ArtifactReadInput = Omit<ArtifactAccessInput, 'artifactSourceHash' | 'file' | 'authenticated'> & { fileId: number, sessionUserId?: number | null }

export async function readArtifactMetadata(env: Env, input: ArtifactReadInput) {
  const db: BaseSQLiteDatabase<'async', unknown, typeof import('./schema')> = connectDB(env)
  const [record] = await db.select({
    file: {
      id: markdown.id,
      path: markdown.path,
      userId: markdown.userId,
      private: markdown.private,
      renderer: markdown.renderer,
      deletedAt: markdown.deletedAt,
      sourceHash: markdown.sourceHash,
    },
    artifact: {
      fileId: markdownRender.fileId,
      sourceHash: markdownRender.sourceHash,
      artifactHash: markdownRender.artifactHash,
      javascriptResourceHash: markdownRender.javascriptResourceHash,
      cssResourceHash: markdownRender.cssResourceHash,
    },
  }).from(markdown).leftJoin(markdownRender, eq(markdownRender.fileId, markdown.id)).where(eq(markdown.id, input.fileId))
  const file = record?.file
  const artifact = record?.artifact
  const authenticated = file?.userId != null && input.sessionUserId === file.userId
  const decision = decideArtifactAccess({ ...input, authenticated, artifactSourceHash: artifact?.sourceHash, file })
  return decision.type === 'allowed' && artifact ? { artifact, decision } : { decision }
}

export async function readArtifactBody(env: Env, input: ArtifactReadInput & { artifactHash: string, privateResource: boolean }, field: 'javascript' | 'css' | 'snapshotHtml') {
  const db: BaseSQLiteDatabase<'async', unknown, typeof import('./schema')> = connectDB(env)
  const [record] = await db.select({ body: markdownRender[field] }).from(markdownRender).innerJoin(markdown, eq(markdown.id, markdownRender.fileId)).where(and(
    eq(markdown.id, input.fileId),
    eq(markdown.renderer, 'svelte'),
    isNull(markdown.deletedAt),
    eq(markdown.private, input.privateResource),
    or(eq(markdown.private, false), input.sessionUserId != null ? eq(markdown.userId, input.sessionUserId) : undefined),
    eq(markdownRender.artifactHash, input.artifactHash),
    input.requestedSourceHash ? eq(markdownRender.sourceHash, input.requestedSourceHash) : undefined,
  ))
  return record?.body
}

export async function readArtifactAccess(env: Env, input: ArtifactReadInput) {
  const result = await readArtifactMetadata(env, input)
  if (!result.artifact)
    return { decision: result.decision }
  const snapshotHtml = await readArtifactBody(env, {
    ...input,
    artifactHash: result.artifact.artifactHash,
    privateResource: result.decision.cacheControl === 'private, no-store',
  }, 'snapshotHtml')
  if (snapshotHtml === undefined)
    return { decision: decideArtifactAccess({ ...input, authenticated: false }) }
  return { decision: result.decision, artifact: { ...result.artifact, snapshotHtml } }
}

export async function replaceDeployedRenderArtifact(env: Env, artifact: StoredRenderArtifact, expectedDeployedArtifactHash: string | null = null) {
  const now = Math.floor(Date.now() / 1000)
  const dependencies = JSON.stringify(artifact.dependencies)
  const expectedDeployed = expectedDeployedArtifactHash
    ? sql`EXISTS (
      SELECT 1 FROM markdown_render
      WHERE fileId = ${artifact.fileId}
        AND sourceHash = ${artifact.sourceHash}
        AND artifactHash = ${expectedDeployedArtifactHash}
    )`
    : sql`NOT EXISTS (
      SELECT 1 FROM markdown_render
      WHERE fileId = ${artifact.fileId}
        AND sourceHash = ${artifact.sourceHash}
    )`
  const result = await connectDB(env).run(sql`
    INSERT INTO markdown_render (
      fileId, schemaVersion, renderer, svelteVersion, unocssVersion, unocssConfigHash,
      sourceHash, dependencies, artifactHash, javascriptResourceHash, cssResourceHash,
      javascript, css, snapshotHtml, createdAt, updatedAt
    )
    SELECT
      ${artifact.fileId}, ${artifact.schemaVersion}, ${artifact.renderer}, ${artifact.svelteVersion},
      ${artifact.unocssVersion}, ${artifact.unocssConfigHash}, ${artifact.sourceHash}, ${dependencies},
      ${artifact.artifactHash}, ${artifact.javascriptResourceHash}, ${artifact.cssResourceHash},
      ${artifact.javascript}, ${artifact.css}, ${artifact.snapshotHtml}, ${now}, ${now}
    WHERE EXISTS (
      SELECT 1 FROM markdown
      WHERE id = ${artifact.fileId}
        AND renderer = 'svelte'
        AND sourceHash = ${artifact.sourceHash}
        AND deletedAt IS NULL
    )
      AND ${expectedDeployed}
    ON CONFLICT(fileId) DO UPDATE SET
      schemaVersion = excluded.schemaVersion,
      renderer = excluded.renderer,
      svelteVersion = excluded.svelteVersion,
      unocssVersion = excluded.unocssVersion,
      unocssConfigHash = excluded.unocssConfigHash,
      sourceHash = excluded.sourceHash,
      dependencies = excluded.dependencies,
      artifactHash = excluded.artifactHash,
      javascriptResourceHash = excluded.javascriptResourceHash,
      cssResourceHash = excluded.cssResourceHash,
      javascript = excluded.javascript,
      css = excluded.css,
      snapshotHtml = excluded.snapshotHtml,
      updatedAt = excluded.updatedAt
  `)
  return affectedRows(result) === 1 ? artifact : undefined
}

export async function readDeployedRenderArtifact(env: Env, fileId: number) {
  const [file, artifact] = await Promise.all([
    connectDB(env).query.markdown.findFirst({ where: eq(markdown.id, fileId) }),
    readRenderArtifact(env, fileId),
  ])
  return file?.renderer === 'svelte'
    && !file.deletedAt
    && artifact?.renderer === 'svelte'
    ? artifact
    : undefined
}

export async function readDeploymentSummary(env: Env, fileId: number, ownerId?: number): Promise<DeploymentSummary | undefined> {
  const db = connectDB(env)
  const file = await db.query.markdown.findFirst({
    columns: { renderer: true, sourceHash: true, deletedAt: true, userId: true },
    where: eq(markdown.id, fileId),
  })
  if (!file || file.deletedAt || (ownerId !== undefined && file.userId !== ownerId))
    return undefined
  if (file.renderer !== 'svelte')
    return deploymentSummary(file, undefined)
  const artifact = await db.query.markdownRender.findFirst({
    columns: { artifactHash: true, sourceHash: true },
    where: eq(markdownRender.fileId, fileId),
  })
  return deploymentSummary(file, artifact)
}
