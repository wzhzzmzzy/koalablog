import { promises as fs } from 'node:fs'

const DB_PATH = 'koala.config.json'

// 初始化存储
async function initStore(filePath: string) {
  try {
    await fs.access(filePath)
    return fs.readFile(filePath, { encoding: 'utf8' })
  }
  catch {
    await fs.writeFile(filePath, '{}')
  }
}

// 读写操作
export class KvStore {
  _init = false
  _dirty = false
  storage: Record<string, any> = {}

  constructor(private readonly filePath = DB_PATH) {}

  async init() {
    const initValue = await initStore(this.filePath)
    if (initValue) {
      try {
        this.storage = JSON.parse(initValue)
      }
      catch {
        console.warn('init value parse failed, clear all', initValue)
        this.storage = {}
        await fs.writeFile(this.filePath, '{}')
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
    this._dirty = true
  }

  sync() {
    return this._flush()
  }

  async _flush() {
    if (!this._dirty)
      return
    await fs.writeFile(this.filePath, JSON.stringify(this.storage))
    this._dirty = false
  }
}

export function createKvStore(filePath = DB_PATH) {
  return new KvStore(filePath)
}

export const storage = createKvStore()
