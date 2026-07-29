import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate'
import { diskPathForAttachment, diskPathForSource, initializeWorkspace, readSource, scanWorkspace } from './workspace.mjs'

function isSafeArchivePath(path) {
  return typeof path === 'string'
    && path.length > 0
    && !path.startsWith('/')
    && !path.split('/').some(segment => !segment || segment === '.' || segment === '..')
}

function sourceArchivePath(file) {
  return `${file.path.slice(1)}${file.renderer === 'svelte' ? '.svelte' : '.md'}`
}

function sourceFromArchivePath(path) {
  if (!isSafeArchivePath(path) || path.startsWith('.koala/') || path.startsWith('attachments/'))
    return null
  if (path.endsWith('.md'))
    return { path: `/${path.slice(0, -3)}`, renderer: 'markdown' }
  if (path.endsWith('.svelte'))
    return { path: `/${path.slice(0, -7)}`, renderer: 'svelte' }
  return null
}

function attachmentFromArchivePath(path) {
  if (!isSafeArchivePath(path) || !path.startsWith('attachments/'))
    return null
  const attachmentPath = path.slice('attachments/'.length)
  return isSafeArchivePath(attachmentPath) ? attachmentPath : null
}

export async function exportExchange(root, archivePath) {
  const workspace = await scanWorkspace(root)
  const entries = {}
  for (const file of workspace.files)
    entries[sourceArchivePath(file)] = strToU8(await readSource(file))
  for (const attachment of workspace.attachments)
    entries[`attachments/${attachment.path}`] = new Uint8Array(await readFile(attachment.absolutePath))
  const target = resolve(archivePath)
  await mkdir(dirname(target), { recursive: true })
  await writeFile(target, zipSync(entries, { level: 6 }))
  return { archivePath: target, files: workspace.files.map(file => file.path), attachments: workspace.attachments.map(file => file.path) }
}

async function writeIfAbsent(path, content) {
  try {
    await writeFile(path, content, { flag: 'wx' })
    return true
  }
  catch (error) {
    if (error?.code === 'EEXIST')
      return false
    throw error
  }
}

export async function importExchange(root, archivePath) {
  await initializeWorkspace(root)
  const entries = unzipSync(new Uint8Array(await readFile(resolve(archivePath))))
  const summary = {
    created: [],
    skippedExisting: [],
    skippedInvalid: [],
    attachments: {
      created: [],
      skippedExisting: [],
      skippedInvalid: [],
    },
    rebuildRequired: [],
  }
  for (const [archiveEntry, content] of Object.entries(entries)) {
    const source = sourceFromArchivePath(archiveEntry)
    if (source) {
      const target = diskPathForSource(root, source.path, source.renderer)
      await mkdir(dirname(target), { recursive: true })
      if (await writeIfAbsent(target, strFromU8(content))) {
        summary.created.push(source.path)
        if (source.renderer === 'svelte')
          summary.rebuildRequired.push(source.path)
      }
      else {
        summary.skippedExisting.push(source.path)
      }
      continue
    }
    const attachment = attachmentFromArchivePath(archiveEntry)
    if (attachment) {
      const target = diskPathForAttachment(root, attachment)
      await mkdir(dirname(target), { recursive: true })
      if (await writeIfAbsent(target, content))
        summary.attachments.created.push(attachment)
      else
        summary.attachments.skippedExisting.push(attachment)
      continue
    }
    if (archiveEntry !== '')
      summary.skippedInvalid.push(archiveEntry)
  }
  return summary
}
