#!/usr/bin/env node

import chokidar from 'chokidar'
import { readFile, writeFile, mkdir, access, constants } from 'fs/promises'
import { join, basename, dirname, relative } from 'path'
import { homedir } from 'os'
import { spawn } from 'child_process'
import { fileURLToPath } from 'url'
import envPaths from 'env-paths'
import { ProxyAgent, setGlobalDispatcher } from 'undici'

const __dirname = dirname(fileURLToPath(import.meta.url))

// XDG paths via env-paths (with fallbacks)
const home = homedir()
const paths = envPaths('koalablog-sync', { suffix: '' })

const stateDir = paths.state || paths.log || process.env.XDG_STATE_HOME || join(home, '.local', 'state')
const runtimeDir = paths.runtime || process.env.XDG_RUNTIME_DIR || join(home, '.local', 'run')
const configPath = join(home, '.config', 'koalablog-sync', 'config.json')

// Ensure directories exist
await Promise.all([stateDir, runtimeDir].map(d => mkdir(d, { recursive: true }).catch(() => {})))

// Load config from file
async function loadConfig() {
  try {
    const configContent = await readFile(configPath, 'utf-8')
    const config = JSON.parse(configContent)
    
    const missing = []
    if (!config.vaultPath) missing.push('vaultPath')
    if (!config.bearerToken) missing.push('bearerToken')
    
    if (missing.length > 0) {
      console.error(`❌ Missing required config: ${missing.join(', ')}`)
      process.exit(1)
    }
    
    if (config.httpProxy) {
      setGlobalDispatcher(new ProxyAgent(config.httpProxy))
    }
    
    return {
      vaultPath: config.vaultPath,
      koalablogUrl: config.koalablogUrl || 'http://localhost:8787',
      bearerToken: config.bearerToken,
    }
  } catch (e) {
    if (e.code === 'ENOENT') {
      console.error(`❌ Config file not found: ${configPath}`)
      console.error('')
      console.error('Please create a config file with the following structure:')
      console.error('')
      console.error('{')
      console.error('  "vaultPath": "/path/to/obsidian/vault",')
      console.error('  "bearerToken": "your-token"')
      console.error('}')
      console.error('')
      process.exit(1)
    }
    console.error(`❌ Failed to parse config file: ${e.message}`)
    process.exit(1)
  }
}

// Config (loaded on demand)
let config = null
const PID_FILE = join(runtimeDir, 'koalablog-sync.pid')
const LOG_FILE = join(stateDir, 'koalablog-sync.log')

const SOURCE_MEMO = '30'
const SYNC_DIRS = ['memos', 'todos']

function getLink(filePath) {
  const relPath = relative(config.vaultPath, filePath)
  return relPath.replace(/\.md$/, '')
}

// Utils
function log(msg) {
  const time = new Date().toISOString()
  const line = `[${time}] ${msg}\n`
  console.log(msg)
  writeFile(LOG_FILE, line, { flag: 'a' }).catch(() => {})
}

async function parseMemo(filePath) {
  try {
    const content = await readFile(filePath, 'utf-8')
    const match = content.match(/^---\n[\s\S]*?\n---\n# (.*)/)
    const subject = match?.[1] || basename(filePath, '.md')
    
    return { path: filePath, content, subject, link: getLink(filePath) }
  } catch {
    return null
  }
}

async function uploadToKoalablog(memo) {
  // Use batch API for single file upload as well
  return batchUploadToKoalablog([memo])
}

async function batchUploadToKoalablog(memos) {
  const payload = memos.map(memo => ({
    source: Number(SOURCE_MEMO),
    link: memo.link,
    subject: memo.subject,
    content: memo.content,
    private: true,
  }))

const res = await fetch(`${config.koalablogUrl}/api/markdown/batch`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${config.bearerToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(err)
  }
  
  return res.json()
}

async function deleteFromKoalablog(link) {
  const res = await fetch(`${config.koalablogUrl}/api/markdown/batch`, {
    method: 'DELETE',
    headers: {
      'Authorization': `Bearer ${config.bearerToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify([link]),
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(err)
  }
  
  return res.json()
}

async function batchDeleteFromKoalablog(links) {
  if (links.length === 0) return { count: 0 }
  
  const res = await fetch(`${config.koalablogUrl}/api/markdown/batch`, {
    method: 'DELETE',
    headers: {
      'Authorization': `Bearer ${config.bearerToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(links),
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(err)
  }
  
  return res.json()
}

async function fetchRemoteMemos() {
  const res = await fetch(`${config.koalablogUrl}/api/markdown/batch?source=memo`, {
    headers: {
      'Authorization': `Bearer ${config.bearerToken}`,
    },
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(err)
  }
  
  return res.json()
}

// Daemon
let watcher = null

async function runDaemon() {
  config = await loadConfig()

  await writeFile(PID_FILE, String(process.pid))
  
  const cleanup = async () => {
    if (watcher) {
      await watcher.close()
    }
    await writeFile(PID_FILE, '').catch(() => {})
    process.exit(0)
  }

  process.on('SIGTERM', cleanup)
  process.on('SIGINT', cleanup)
  
  log(`🚀 Starting sync daemon...`)
  log(`   Vault: ${config.vaultPath}`)
  log(`   Koalablog: ${config.koalablogUrl}`)
  
  const watchPaths = SYNC_DIRS.map(d => join(config.vaultPath, d))
  
  watcher = chokidar.watch(watchPaths, {
    ignored: /(^|[\/\\])\../,
    persistent: true,
    ignoreInitial: true,
    awaitWriteFinish: {
      stabilityThreshold: 1000,
      pollInterval: 100,
    },
  })

  watcher.on('add', async (path) => {
    if (!path.endsWith('.md')) return
    
    log(`📝 New: ${basename(path)}`)
    const memo = await parseMemo(path)
    if (memo) {
      try {
        await uploadToKoalablog(memo)
        log(`✅ Synced: ${memo.subject}`)
      } catch (e) {
        log(`❌ Failed: ${e.message}`, true)
      }
    }
  })

  watcher.on('change', async (path) => {
    if (!path.endsWith('.md')) return
    log(`📝 Changed: ${basename(path)}`)
    const memo = await parseMemo(path)
    if (memo) {
      try {
        await uploadToKoalablog(memo)
        log(`✅ Synced: ${memo.subject}`)
      } catch (e) {
        log(`❌ Failed: ${e.message}`, true)
      }
    }
  })

  watcher.on('unlink', async (path) => {
    if (!path.endsWith('.md')) return
    
    log(`🗑️ Removed: ${basename(path)}`)
    const link = getLink(path)
    
    try {
      await deleteFromKoalablog(link)
      log(`✅ Deleted: ${link}`)
    } catch (e) {
      log(`❌ Delete failed: ${e.message}`, true)
    }
  })

  log(`👀 Watching: ${config.vaultPath}`)
}

async function startDaemon() {
  try {
    await access(PID_FILE, constants.F_OK)
    const pid = await readFile(PID_FILE, 'utf-8')
    const trimmedPid = pid.trim()
    if (trimmedPid) {
      try {
        process.kill(parseInt(trimmedPid), 0)
        console.log(`❌ Already running with PID: ${trimmedPid}`)
        process.exit(1)
      } catch {
        // Process not running, clean up PID file
        await writeFile(PID_FILE, '')
      }
    }
  } catch {
    // PID file doesn't exist, continue
  }

  const child = spawn(process.execPath, [join(__dirname, 'index.js'), '--daemon'], {
    detached: true,
    stdio: 'ignore',
  })

  child.unref()

  console.log(`✅ Daemon started with PID: ${child.pid}`)
  process.exit(0)
}

async function stopDaemon() {
  try {
    const pid = (await readFile(PID_FILE, 'utf-8')).trim()
    process.kill(parseInt(pid), 'SIGTERM')
    log(`🛑 Stopped daemon (PID: ${pid})`)
    await writeFile(PID_FILE, '')
  } catch {
    console.log('❌ Not running')
  }
}

async function statusDaemon() {
  try {
    await access(PID_FILE, constants.F_OK)
    const pid = (await readFile(PID_FILE, 'utf-8')).trim()
    if (pid) {
      console.log(`✅ Running (PID: ${pid})`)
      return true
    }
  } catch {}
  console.log('❌ Not running')
  return false
}

async function showLogs() {
  try {
    const content = await readFile(LOG_FILE, 'utf-8')
    const lines = content.split('\n').filter(Boolean).slice(-50)
    console.log(lines.join('\n'))
  } catch {
    console.log('No logs found')
  }
}

async function fullSync() {
  config = await loadConfig()
  
  const { readdir } = await import('fs/promises')
  
  log(`📋 Starting full sync...`)
  
  const files = []
  const readDir = async (dir) => {
    const entries = await readdir(dir, { withFileTypes: true })
    for (const entry of entries) {
      const fullPath = join(dir, entry.name)
      if (entry.isDirectory()) {
        if (!entry.name.startsWith('.')) {
          await readDir(fullPath)
        }
      } else if (entry.isFile() && entry.name.endsWith('.md')) {
        files.push(fullPath)
      }
    }
  }
  
  for (const dir of SYNC_DIRS) {
    const dirPath = join(config.vaultPath, dir)
    try {
      await readDir(dirPath)
    } catch {
      log(`⚠️ Directory not found: ${dir}`)
    }
  }
  
  log(`📁 Found ${files.length} markdown files`)
  
  const memos = []
  for (const path of files) {
    const memo = await parseMemo(path)
    if (memo) memos.push(memo)
  }
  
  if (memos.length === 0) {
    log(`⚠️ No valid memos to sync`)
    return
  }
  
  const BATCH_SIZE = 5
  const batches = []
  for (let i = 0; i < memos.length; i += BATCH_SIZE) {
    batches.push(memos.slice(i, i + BATCH_SIZE))
  }
  
  log(`📦 Uploading ${memos.length} files in ${batches.length} batches...`)
  
  let totalUploaded = 0
  let totalSkipped = 0
  let failed = 0
  
  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i]
    log(`   Batch ${i + 1}/${batches.length}: uploading ${batch.length} files...`)
    
    try {
      const result = await batchUploadToKoalablog(batch)
      totalUploaded += result.count || 0
      totalSkipped += result.skipped || 0
      log(`   ✅ Batch ${i + 1}: ${result.count || 0} uploaded, ${result.skipped || 0} skipped`)
    } catch (e) {
      log(`   ❌ Batch ${i + 1} failed: ${e.message}`, true)
      failed += batch.length
    }
  }
  
  log(`📊 Summary: ${totalUploaded} uploaded, ${totalSkipped} skipped, ${failed} failed`)
  
  log(`🔍 Checking for remote records to delete...`)
  
  try {
    const remoteMemos = await fetchRemoteMemos()
    const localLinks = new Set(memos.map(m => m.link))
    
    const toDelete = remoteMemos
      .filter(r => {
        if (localLinks.has(r.link)) return false
        return SYNC_DIRS.some(dir => r.link.startsWith(`${dir}/`))
      })
      .map(r => r.link)
    
    if (toDelete.length > 0) {
      log(`🗑️ Found ${toDelete.length} remote records to delete`)
      
      const deleteResult = await batchDeleteFromKoalablog(toDelete)
      log(`✅ Deleted ${deleteResult.count || 0} remote records`)
    } else {
      log(`✅ No remote records to delete`)
    }
  } catch (e) {
    log(`⚠️ Failed to check remote records: ${e.message}`, true)
  }
  
  if (failed > 0) {
    process.exit(1)
  }
}

// CLI
const cmd = process.argv[2]

if (cmd === '--daemon') {
  runDaemon()
} else {
  switch (cmd) {
    case 'start':
      startDaemon()
      break
    case 'stop':
      stopDaemon()
      break
    case 'status':
      statusDaemon()
      break
    case 'logs':
      showLogs()
      break
    case 'restart':
      stopDaemon().then(() => new Promise(r => setTimeout(r, 1000))).then(startDaemon)
      break
    case 'sync':
      fullSync()
      break
    default:
      console.log(`
🐳 Koalablog Sync CLI

Usage: koalablog-sync <command>

Commands:
  start   - Start the sync daemon (runs in background)
  stop    - Stop the sync daemon  
  status  - Check if daemon is running
  logs    - View sync logs
  restart - Restart the daemon
  sync    - Full sync all markdown files to koalablog

Config file: ~/.config/koalablog-sync/config.json

Required fields:
  vaultPath   - Path to Obsidian vault
  bearerToken - Bearer token for authentication

Optional fields:
  koalablogUrl - Koalablog URL (default: http://localhost:8787)
  httpProxy    - HTTP proxy URL (e.g. http://127.0.0.1:7890)

Example config:
  {
    "vaultPath": "/path/to/obsidian/vault",
    "bearerToken": "your-token",
    "koalablogUrl": "https://your-blog.com",
    "httpProxy": "http://127.0.0.1:7890"
  }
`)
      process.exit(cmd ? 1 : 0)
  }
}
