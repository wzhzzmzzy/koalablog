import { promises as fs } from 'node:fs'
import consola from 'consola'

const DB_PATH = 'koala.config.json'

// 初始化存储
async function initStore() {
  try {
    await fs.access(DB_PATH)
    return fs.readFile(DB_PATH, { encoding: 'utf8' })
  }
  catch {
    await fs.writeFile(DB_PATH, '{}')
  }
}

// 读写操作
class KvStore {
  _init = false
  _scheduleChange = new Set<string>()
  storage: Record<string, any> = {}

  async init() {
    const initValue = await initStore()
    if (initValue) {
      try {
        this.storage = JSON.parse(initValue)
      }
      catch {
        consola.warn('init value parse failed, clear all', initValue)
        await fs.writeFile(DB_PATH, '{}')
      }
    }
    this._init = true
  }

  async get(key: string) {
    if (!this._init) {
      await this.init()
    }

    return this.storage[key] ?? undefined
  }

  async set(key: string, value: any) {
    if (!this._init) {
      await this.init()
    }

    this.storage[key] = value
    this._schedule(key)
  }

  _schedule(key: string) {
    this._scheduleChange.add(key)
    setTimeout(() => {
      this._flush()
    }, 1000)
  }

  async _flush() {
    this._scheduleChange.clear()
    await fs.writeFile(DB_PATH, JSON.stringify(this.storage))
  }
}

export const storage = new KvStore()
