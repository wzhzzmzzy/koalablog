import { createHash } from 'node:crypto'
import { mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises'
import { join, relative, resolve } from 'node:path'

export const STATE_DIRECTORY = '.koala'
export const STATE_FILE = 'sync-state.json'
export const ATTACHMENT_DIRECTORY = 'attachments'

export function workspacePaths(root) {
  const absoluteRoot = resolve(root)
  return {
    root: absoluteRoot,
    stateDirectory: join(absoluteRoot, STATE_DIRECTORY),
    stateFile: join(absoluteRoot, STATE_DIRECTORY, STATE_FILE),
    attachmentDirectory: join(absoluteRoot, ATTACHMENT_DIRECTORY),
  }
}

export async function initializeWorkspace(root) {
  const paths = workspacePaths(root)
  await Promise.all([
    mkdir(paths.stateDirectory, { recursive: true }),
    mkdir(paths.attachmentDirectory, { recursive: true }),
  ])
  try {
    await readFile(paths.stateFile, 'utf8')
  }
  catch {
    await writeFile(paths.stateFile, `${JSON.stringify({ version: 1, files: {}, attachments: {} }, null, 2)}\n`)
  }
  return paths
}

export async function readSyncState(root) {
  const { stateFile } = workspacePaths(root)
  try {
    const parsed = JSON.parse(await readFile(stateFile, 'utf8'))
    if (parsed?.version !== 1 || typeof parsed.files !== 'object' || typeof parsed.attachments !== 'object')
      throw new Error('invalid sync state')
    return parsed
  }
  catch (error) {
    if (error?.code === 'ENOENT')
      return { version: 1, files: {}, attachments: {} }
    throw error
  }
}

export async function writeSyncState(root, state) {
  const paths = await initializeWorkspace(root)
  await writeFile(paths.stateFile, `${JSON.stringify(state, null, 2)}\n`)
}

function rendererFor(relativePath) {
  if (relativePath.endsWith('.md'))
    return 'markdown'
  if (relativePath.endsWith('.svelte'))
    return 'svelte'
  return null
}

function sourcePath(relativePath, renderer) {
  const extension = renderer === 'svelte' ? '.svelte' : '.md'
  return `/${relativePath.slice(0, -extension.length)}`
}

function checkedRelativePath(value) {
  if (typeof value !== 'string' || !value || value.startsWith('/') || value.split('/').some(segment => !segment || segment === '.' || segment === '..'))
    throw new Error(`Invalid workspace-relative path: ${value}`)
  return value
}

function checkedSourcePath(path) {
  if (typeof path !== 'string' || !path.startsWith('/') || path === '/' || path.split('/').some(segment => segment === '.' || segment === '..'))
    throw new Error(`Invalid File Path: ${path}`)
  return path.slice(1)
}

function fileIdentity(fileStat) {
  return `${fileStat.dev}:${fileStat.ino}`
}

async function visit(root, directory, results) {
  const entries = await readdir(directory, { withFileTypes: true })
  for (const entry of entries) {
    if (entry.name === STATE_DIRECTORY)
      continue
    const absolutePath = join(directory, entry.name)
    if (entry.isDirectory()) {
      await visit(root, absolutePath, results)
      continue
    }
    if (!entry.isFile())
      continue
    const relativePath = relative(root, absolutePath).replaceAll('\\', '/')
    const fileStat = await stat(absolutePath)
    if (relativePath.startsWith(`${ATTACHMENT_DIRECTORY}/`)) {
      results.attachments.push({
        path: relativePath.slice(ATTACHMENT_DIRECTORY.length + 1),
        absolutePath,
        mtimeMs: fileStat.mtimeMs,
        size: fileStat.size,
        identity: fileIdentity(fileStat),
      })
      continue
    }
    const renderer = rendererFor(relativePath)
    if (!renderer)
      continue
    results.files.push({
      path: sourcePath(relativePath, renderer),
      renderer,
      absolutePath,
      relativePath,
      mtimeMs: fileStat.mtimeMs,
      size: fileStat.size,
      identity: fileIdentity(fileStat),
    })
  }
}

export async function scanWorkspace(root) {
  const paths = workspacePaths(root)
  /** @type {{files: Array<{path: string, renderer: string, absolutePath: string, relativePath: string, mtimeMs: number, size: number, identity: string}>, attachments: Array<{path: string, absolutePath: string, mtimeMs: number, size: number, identity: string}>}} */
  const results = { files: [], attachments: [] }
  await visit(paths.root, paths.root, results)
  results.files.sort((left, right) => left.path.localeCompare(right.path))
  results.attachments.sort((left, right) => left.path.localeCompare(right.path))
  return results
}

export function diskPathForSource(root, path, renderer) {
  const relativePath = checkedSourcePath(path)
  if (renderer !== 'markdown' && renderer !== 'svelte')
    throw new Error(`Unsupported renderer: ${renderer}`)
  return join(workspacePaths(root).root, `${relativePath}${renderer === 'svelte' ? '.svelte' : '.md'}`)
}

export function diskPathForAttachment(root, path) {
  return join(workspacePaths(root).attachmentDirectory, checkedRelativePath(path))
}

export async function statSource(root, path, renderer) {
  const absolutePath = diskPathForSource(root, path, renderer)
  const fileStat = await stat(absolutePath)
  return {
    path,
    renderer,
    absolutePath,
    relativePath: `${path.slice(1)}${renderer === 'svelte' ? '.svelte' : '.md'}`,
    mtimeMs: fileStat.mtimeMs,
    size: fileStat.size,
    identity: fileIdentity(fileStat),
  }
}

export async function statAttachment(root, path) {
  const absolutePath = diskPathForAttachment(root, path)
  const fileStat = await stat(absolutePath)
  return {
    path,
    absolutePath,
    mtimeMs: fileStat.mtimeMs,
    size: fileStat.size,
    identity: fileIdentity(fileStat),
  }
}

export async function readSource(file) {
  return readFile(file.absolutePath, 'utf8')
}

export function sourceHash(renderer, content) {
  return createHash('sha256').update(JSON.stringify(['koala-source-v1', renderer, content]), 'utf8').digest('hex')
}

export function attachmentHash(content) {
  return createHash('sha256').update(content).digest('hex')
}

export async function instantSearch(root, query) {
  const normalized = query.toLocaleLowerCase()
  const workspace = await scanWorkspace(root)
  const matches = []
  for (const file of workspace.files) {
    const content = await readSource(file)
    const haystack = `${file.path}\n${content}`.toLocaleLowerCase()
    const position = haystack.indexOf(normalized)
    if (position >= 0) {
      const start = Math.max(0, position - 60)
      matches.push({ path: file.path, snippet: `${start > 0 ? '…' : ''}${content.slice(Math.max(0, position - file.path.length - 61), Math.max(0, position - file.path.length + normalized.length + 100))}` })
    }
  }
  for (const attachment of workspace.attachments) {
    if (attachment.path.toLocaleLowerCase().includes(normalized))
      matches.push({ path: `/attachments/${attachment.path}`, snippet: attachment.path })
  }
  return matches
}

export function stateEntry(file, remote) {
  return {
    id: remote.id,
    revision: remote.revision,
    sourceHash: remote.sourceHash,
    mtimeMs: file.mtimeMs,
    size: file.size,
    identity: file.identity,
  }
}

export function attachmentStateEntry(file, remote, hash) {
  return {
    etag: remote.etag,
    updatedAt: remote.updatedAt,
    hash,
    mtimeMs: file.mtimeMs,
    size: file.size,
    identity: file.identity,
  }
}
