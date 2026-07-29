#!/usr/bin/env node

import { resolve } from 'node:path'
import process from 'node:process'
import { KoalaSyncClient } from '../scripts/koala/client.mjs'
import { exportExchange, importExchange } from '../scripts/koala/exchange.mjs'
import { startSveltePreview } from '../scripts/koala/preview.mjs'
import { synchronizeOnce } from '../scripts/koala/sync.mjs'
import { initializeWorkspace, instantSearch, readSyncState, scanWorkspace } from '../scripts/koala/workspace.mjs'

function usage() {
  return `Usage:
  koala workspace init <path>
  koala workspace status [--json]
  koala search <query> [--json]
  koala sync --once [--json]
  koala exchange export <archive-path> [--json]
  koala exchange import <archive-path> [--json]
  koala preview <source-path>`
}

function workspaceRoot() {
  return resolve(process.env.KOALABLOG_WORKSPACE ?? process.cwd())
}

function output(value, json) {
  process.stdout.write(`${json ? JSON.stringify(value) : typeof value === 'string' ? value : JSON.stringify(value, null, 2)}\n`)
}

function hasFailures(summary) {
  return summary.failed?.length > 0
}

async function main(argv) {
  const json = argv.includes('--json')
  const args = argv.filter(argument => argument !== '--json')
  const [command, subcommand, value] = args
  if (command === 'workspace' && subcommand === 'init' && value) {
    const paths = await initializeWorkspace(resolve(value))
    output({ initialized: paths.root }, json)
    return 0
  }
  if (command === 'workspace' && subcommand === 'status' && !value) {
    const root = workspaceRoot()
    const [state, workspace] = await Promise.all([readSyncState(root), scanWorkspace(root)])
    output({ root, files: workspace.files.map(file => file.path), attachments: workspace.attachments.map(file => file.path), trackedFiles: Object.keys(state.files), trackedAttachments: Object.keys(state.attachments) }, json)
    return 0
  }
  if (command === 'search' && subcommand) {
    const matches = await instantSearch(workspaceRoot(), subcommand)
    output({ matches }, json)
    return 0
  }
  if (command === 'sync' && subcommand === '--once' && !value) {
    const summary = await synchronizeOnce(workspaceRoot(), new KoalaSyncClient())
    output(summary, json)
    return hasFailures(summary) ? 1 : 0
  }
  if (command === 'exchange' && subcommand === 'export' && value) {
    output(await exportExchange(workspaceRoot(), value), json)
    return 0
  }
  if (command === 'exchange' && subcommand === 'import' && value) {
    output(await importExchange(workspaceRoot(), value), json)
    return 0
  }
  if (command === 'preview' && subcommand && !value) {
    const preview = await startSveltePreview(resolve(workspaceRoot(), subcommand))
    process.stdout.write(`Preview: ${preview.url}\n`)
    const close = async () => {
      await preview.close()
      process.exit(0)
    }
    process.once('SIGINT', close)
    process.once('SIGTERM', close)
    return await new Promise(() => {})
  }
  throw new Error(usage())
}

main(process.argv.slice(2)).then((code) => {
  process.exitCode = code
}).catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
