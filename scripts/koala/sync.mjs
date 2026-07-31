import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import {
  attachmentHash,
  attachmentStateEntry,
  diskPathForAttachment,
  diskPathForSource,
  readSource,
  readSyncState,
  scanWorkspace,
  sourceHash,
  statAttachment,
  stateEntry,
  statSource,
  writeSyncState,
} from './workspace.mjs'

function fileChanged(previous, file) {
  return !previous || previous.mtimeMs !== file.mtimeMs || previous.size !== file.size
}

function remoteAttachmentChanged(previous, remote) {
  return !previous || previous.etag !== remote.etag || previous.updatedAt !== remote.updatedAt || previous.size !== remote.size
}

function remoteAttachmentWins(localMtimeMs, updatedAt) {
  return new Date(updatedAt).getTime() >= localMtimeMs
}

function remoteSourceChanged(previous, remote) {
  return !previous || previous.sourceHash !== remote.sourceHash
}

async function localSourceChange(previous, file) {
  if (previous && !fileChanged(previous, file))
    return { changed: false }
  const content = await readSource(file)
  const hash = sourceHash(file.renderer, content)
  return { changed: !previous || previous.sourceHash !== hash, content, hash }
}

function contentType(path) {
  const extension = path.split('.').pop()?.toLowerCase()
  return ({
    gif: 'image/gif',
    jpeg: 'image/jpeg',
    jpg: 'image/jpeg',
    json: 'application/json',
    mp3: 'audio/mpeg',
    mp4: 'video/mp4',
    pdf: 'application/pdf',
    png: 'image/png',
    svg: 'image/svg+xml',
    txt: 'text/plain',
    webp: 'image/webp',
  })[extension] ?? 'application/octet-stream'
}

async function writeRemoteFile(root, remote) {
  const target = diskPathForSource(root, remote.path, remote.renderer)
  await mkdir(dirname(target), { recursive: true })
  await writeFile(target, remote.content)
  return statSource(root, remote.path, remote.renderer)
}

async function writeRemoteAttachment(root, path, content) {
  const target = diskPathForAttachment(root, path)
  await mkdir(dirname(target), { recursive: true })
  await writeFile(target, content)
  return statAttachment(root, path)
}

async function removeLocalSource(root, remote) {
  await unlink(diskPathForSource(root, remote.path, remote.renderer))
}

async function removeLocalAttachment(root, path) {
  await unlink(diskPathForAttachment(root, path))
}

function addFailure(summary, path, error, kind = 'files') {
  const failure = { path, error: error instanceof Error ? error.message : String(error) }
  summary.failed.push(failure)
  summary[kind].failed.push(failure)
}

function emptySummary() {
  return {
    created: [],
    updated: [],
    pulled: [],
    removed: [],
    renamed: [],
    rebuildRequired: [],
    failed: [],
    conflicted: [],
    files: {
      created: [],
      updated: [],
      pulled: [],
      removed: [],
      renamed: [],
      failed: [],
      conflicted: [],
    },
    attachments: {
      uploaded: [],
      downloaded: [],
      removed: [],
      failed: [],
    },
  }
}

function recordFile(summary, key, path) {
  summary[key].push(path)
  summary.files[key].push(path)
}

function recordConflict(summary, path) {
  summary.conflicted.push(path)
  summary.files.conflicted.push(path)
}

function markRebuild(summary, file) {
  if (file.renderer === 'svelte' && !summary.rebuildRequired.includes(file.path))
    summary.rebuildRequired.push(file.path)
}

/**
 * Reconcile a local workspace once. Each successful item advances only its own
 * state entry; callers can safely retry a partial failure in the next cycle.
 */
export async function synchronizeOnce(root, client) {
  const [state, local, manifest] = await Promise.all([readSyncState(root), scanWorkspace(root), client.manifest()])
  const nextState = { version: 1, files: { ...state.files }, attachments: { ...state.attachments } }
  const summary = emptySummary()
  const remoteByPath = new Map(manifest.files.map(file => [file.path, file]))
  const localByPath = new Map(local.files.map(file => [file.path, file]))
  const localAttachmentByPath = new Map(local.attachments.map(file => [file.path, file]))
  const remoteAttachmentByPath = new Map(manifest.attachments.map(file => [file.path, file]))
  const handledRemoteFiles = new Set()
  const handledRemoteAttachments = new Set()
  const renamedStatePaths = new Set()

  // Rename detection intentionally uses device/inode, so only a rename inside
  // one filesystem retains the online File identity.
  const oldFilePathByIdentity = new Map()
  for (const [path, previous] of Object.entries(state.files)) {
    if (!localByPath.has(path) && previous.identity)
      oldFilePathByIdentity.set(previous.identity, path)
  }

  for (const file of local.files) {
    const previous = state.files[file.path]
    const oldPath = !previous ? oldFilePathByIdentity.get(file.identity) : undefined
    if (!oldPath)
      continue
    const oldState = state.files[oldPath]
    const remote = remoteByPath.get(oldPath)
    if (!oldState || !remote)
      continue
    try {
      const localChange = await localSourceChange(oldState, file)
      const remoteChanged = remoteSourceChanged(oldState, remote)
      if (localChange.changed && remoteChanged && localChange.hash !== remote.sourceHash) {
        recordConflict(summary, `${oldPath} -> ${file.path}`)
        continue
      }
      // A rename is independent from Source reconciliation. If the Source
      // changed remotely only, preserve it while moving the same File identity.
      let content = localChange.content ?? await readSource(file)
      if (remoteChanged && !localChange.changed)
        content = (await client.getFile(remote.id)).content
      const saved = await client.updateFile(remote.id, {
        path: file.path,
        renderer: file.renderer,
        content,
        baseRevision: remote.revision,
      })
      if (content !== await readSource(file))
        await writeRemoteFile(root, { ...saved, content })
      const refreshed = await statSource(root, file.path, file.renderer)
      nextState.files[file.path] = stateEntry(refreshed, saved)
      delete nextState.files[oldPath]
      renamedStatePaths.add(oldPath)
      handledRemoteFiles.add(oldPath)
      recordFile(summary, 'renamed', `${oldPath} -> ${file.path}`)
      markRebuild(summary, saved)
    }
    catch (error) {
      addFailure(summary, file.path, error)
    }
  }

  for (const file of local.files) {
    if (!state.files[file.path] && oldFilePathByIdentity.has(file.identity))
      continue
    const previous = state.files[file.path]
    const remote = remoteByPath.get(file.path)
    try {
      if (!remote) {
        // A File known to prior state but absent remotely was removed online.
        if (previous) {
          await removeLocalSource(root, file)
          delete nextState.files[file.path]
          recordFile(summary, 'removed', file.path)
          continue
        }
        const created = await client.createFile({ path: file.path, renderer: file.renderer, content: await readSource(file) })
        nextState.files[file.path] = stateEntry(file, created)
        recordFile(summary, 'created', file.path)
        markRebuild(summary, created)
        continue
      }
      handledRemoteFiles.add(file.path)
      const localChange = await localSourceChange(previous, file)
      const remoteChanged = remoteSourceChanged(previous, remote)
      if (!localChange.changed && !remoteChanged) {
        nextState.files[file.path] = stateEntry(file, remote)
        continue
      }
      if (localChange.changed && remoteChanged) {
        if (localChange.hash === remote.sourceHash)
          nextState.files[file.path] = stateEntry(file, remote)
        else
          recordConflict(summary, file.path)
        continue
      }
      if (remoteChanged) {
        const source = await client.getFile(remote.id)
        const refreshed = await writeRemoteFile(root, source)
        nextState.files[file.path] = stateEntry(refreshed, remote)
        recordFile(summary, 'pulled', file.path)
        markRebuild(summary, source)
        continue
      }
      const saved = await client.updateFile(remote.id, {
        path: file.path,
        renderer: file.renderer,
        content: localChange.content,
        baseRevision: remote.revision,
      })
      nextState.files[file.path] = stateEntry(file, saved)
      recordFile(summary, 'updated', file.path)
      markRebuild(summary, saved)
    }
    catch (error) {
      addFailure(summary, file.path, error)
    }
  }

  // A locally removed tracked File is an explicit online trash operation.
  for (const [path, previous] of Object.entries(state.files)) {
    if (localByPath.has(path) || renamedStatePaths.has(path))
      continue
    const remote = remoteByPath.get(path)
    try {
      if (remote) {
        await client.deleteFile(remote.id, remote.revision)
        handledRemoteFiles.add(path)
        recordFile(summary, 'removed', path)
      }
      delete nextState.files[path]
    }
    catch (error) {
      addFailure(summary, path, error)
      nextState.files[path] = previous
    }
  }

  // Remote Files first seen in this cycle are pulled after local deletion has
  // been handled, preventing them from being mistaken for local removals.
  for (const remote of manifest.files) {
    if (handledRemoteFiles.has(remote.path) || localByPath.has(remote.path))
      continue
    try {
      const source = await client.getFile(remote.id)
      const refreshed = await writeRemoteFile(root, source)
      nextState.files[remote.path] = stateEntry(refreshed, remote)
      recordFile(summary, 'pulled', remote.path)
      markRebuild(summary, source)
    }
    catch (error) {
      addFailure(summary, remote.path, error)
    }
  }

  for (const attachment of local.attachments) {
    const previous = state.attachments[attachment.path]
    const remote = remoteAttachmentByPath.get(attachment.path)
    try {
      if (!remote) {
        if (previous) {
          await removeLocalAttachment(root, attachment.path)
          delete nextState.attachments[attachment.path]
          summary.attachments.removed.push(attachment.path)
          continue
        }
        const bytes = await readFile(attachment.absolutePath)
        const uploaded = await client.putAttachment(attachment.path, bytes, contentType(attachment.path))
        nextState.attachments[attachment.path] = attachmentStateEntry(attachment, uploaded, attachmentHash(bytes))
        summary.attachments.uploaded.push(attachment.path)
        continue
      }
      handledRemoteAttachments.add(attachment.path)
      const localChanged = fileChanged(previous, attachment)
      const remoteChanged = remoteAttachmentChanged(previous, remote)
      if (!localChanged && !remoteChanged) {
        nextState.attachments[attachment.path] = attachmentStateEntry(attachment, remote, previous.hash)
        continue
      }
      if (remoteChanged && (!localChanged || remoteAttachmentWins(attachment.mtimeMs, remote.updatedAt))) {
        const bytes = await client.getAttachment(attachment.path)
        const refreshed = await writeRemoteAttachment(root, attachment.path, bytes)
        nextState.attachments[attachment.path] = attachmentStateEntry(refreshed, remote, attachmentHash(bytes))
        summary.attachments.downloaded.push(attachment.path)
        continue
      }
      const bytes = await readFile(attachment.absolutePath)
      const uploaded = await client.putAttachment(attachment.path, bytes, contentType(attachment.path))
      nextState.attachments[attachment.path] = attachmentStateEntry(attachment, uploaded, attachmentHash(bytes))
      summary.attachments.uploaded.push(attachment.path)
    }
    catch (error) {
      addFailure(summary, `/attachments/${attachment.path}`, error, 'attachments')
    }
  }

  for (const [path, previous] of Object.entries(state.attachments)) {
    if (localAttachmentByPath.has(path))
      continue
    const remote = remoteAttachmentByPath.get(path)
    try {
      if (remote) {
        await client.deleteAttachment(path)
        handledRemoteAttachments.add(path)
        summary.attachments.removed.push(path)
      }
      delete nextState.attachments[path]
    }
    catch (error) {
      addFailure(summary, `/attachments/${path}`, error, 'attachments')
      nextState.attachments[path] = previous
    }
  }

  for (const remote of manifest.attachments) {
    if (handledRemoteAttachments.has(remote.path) || localAttachmentByPath.has(remote.path))
      continue
    try {
      const bytes = await client.getAttachment(remote.path)
      const refreshed = await writeRemoteAttachment(root, remote.path, bytes)
      nextState.attachments[remote.path] = attachmentStateEntry(refreshed, remote, attachmentHash(bytes))
      summary.attachments.downloaded.push(remote.path)
    }
    catch (error) {
      addFailure(summary, `/attachments/${remote.path}`, error, 'attachments')
    }
  }

  await writeSyncState(root, nextState)
  return summary
}

export function canonicalHash(renderer, content) {
  return sourceHash(renderer, content)
}
