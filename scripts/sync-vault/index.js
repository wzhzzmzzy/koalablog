#!/usr/bin/env node

import chokidar from 'chokidar'
import { readFile, writeFile, mkdir, access, constants } from 'fs/promises'
import { join, basename } from 'path'
import { homedir } from 'os'
import envPaths from 'env-paths'

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
    
    // Validate required fields
    const missing = []
    if (!config.vaultPath) missing.push('vaultPath')
    if (!config.bearerToken) missing.push('bearerToken')
    
    if (missing.length > 0) {
      console.error(`❌ Missing required config: ${missing.join(', ')}`)
      process.exit(1)
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

const SOURCE_MEMO = '1' // Memo type in koalablog

// Utils
function log(msg, isError = false) {
  const time = new Date().toISOString()
  const line = `[${time}] ${msg}\n`
  console.log(msg)
  writeFile(LOG_FILE, line, { flag: 'a' }).catch(() => {})
}

async function parseMemo(filePath) {
  try {
    const content = await readFile(filePath, 'utf-8')
    // Extract title from first H1
    const match = content.match(/^---\n[\s\S]*?\n---\n# (.*)/)
    const subject = match?.[1] || basename(filePath, '.md')
    
    return { path: filePath, content, subject }
  } catch {
    return null
  }
}

async function uploadToKoalablog(memo) {
  const link = `memo/${basename(memo.path, '.md')}`
  
  const params = new URLSearchParams({
    source: SOURCE_MEMO,
    link,
    subject: memo.subject,
    content: memo.content,
    private: 'true',
  })

  const res = await fetch(`${config.koalablogUrl}/api/markdown/save`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${config.bearerToken}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params,
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(err)
  }
  
  return true
}

async function batchUploadToKoalablog(memos) {
  const payload = memos.map(memo => ({
    source: Number(SOURCE_MEMO),
    link: `memo/${basename(memo.path, '.md')}`,
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

// Daemon
let watcher = null

async function startDaemon() {
  // Check if already running
  try {
    await access(PID_FILE, constants.F_OK)
    const pid = await readFile(PID_FILE, 'utf-8')
    console.log(`❌ Already running with PID: ${pid.trim()}`)
    process.exit(1)
  } catch {
    // Not running, continue
  }

  // Load config
  config = await loadConfig()

  // Write PID
  await writeFile(PID_FILE, String(process.pid))
  
  log(`🚀 Starting sync daemon...`)
  log(`   Vault: ${config.vaultPath}`)
  log(`   Koalablog: ${config.koalablogUrl}`)
  
  watcher = chokidar.watch(config.vaultPath, {
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
    log(`🗑️ Removed: ${basename(path)}`)
  })

  log(`👀 Watching: ${config.vaultPath}`)
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
  
  await readDir(config.vaultPath)
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
  
  log(`📦 Batch uploading ${memos.length} files...`)
  
  try {
    const result = await batchUploadToKoalablog(memos)
    log(`✅ Batch synced: ${result.count} uploaded, ${result.skipped || 0} skipped`)
  } catch (e) {
    log(`❌ Batch upload failed: ${e.message}`, true)
    process.exit(1)
  }
}

// CLI
const cmd = process.argv[2]

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
  start   - Start the sync daemon
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

Example config:
  {
    "vaultPath": "/path/to/obsidian/vault",
    "bearerToken": "your-token",
    "koalablogUrl": "https://your-blog.com"
  }
`)
    process.exit(cmd ? 1 : 0)
}
