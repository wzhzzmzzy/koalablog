import type { SvelteArtifactHashes, SvelteArtifactInputV1 } from '@/lib/svelte/contracts'
import { type ArtifactAccessInput, decideArtifactAccess } from '@/lib/svelte/artifact-access'
import { eq, sql } from 'drizzle-orm'
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

export async function readArtifactAccess(env: Env, input: Omit<ArtifactAccessInput, 'artifactSourceHash' | 'file'> & { fileId: number }) {
  const [file, artifact] = await Promise.all([
    connectDB(env).query.markdown.findFirst({ where: eq(markdown.id, input.fileId) }),
    readRenderArtifact(env, input.fileId),
  ])
  const decision = decideArtifactAccess({ ...input, artifactSourceHash: artifact?.sourceHash, file })
  return decision.type === 'allowed' && artifact ? { artifact, decision } : { decision }
}

export async function replaceCurrentRenderArtifact(env: Env, artifact: StoredRenderArtifact, expectedCurrentArtifactHash: string | null = null) {
  const now = Math.floor(Date.now() / 1000)
  const dependencies = JSON.stringify(artifact.dependencies)
  const expectedCurrent = expectedCurrentArtifactHash
    ? sql`EXISTS (
      SELECT 1 FROM markdown_render
      WHERE fileId = ${artifact.fileId}
        AND sourceHash = ${artifact.sourceHash}
        AND artifactHash = ${expectedCurrentArtifactHash}
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
      AND ${expectedCurrent}
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

export async function readCurrentRenderArtifact(env: Env, fileId: number) {
  const [file, artifact] = await Promise.all([
    connectDB(env).query.markdown.findFirst({ where: eq(markdown.id, fileId) }),
    readRenderArtifact(env, fileId),
  ])
  return file?.renderer === 'svelte'
    && !file.deletedAt
    && artifact?.renderer === 'svelte'
    && artifact.sourceHash === file.sourceHash
    ? artifact
    : undefined
}
