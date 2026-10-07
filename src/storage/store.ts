/**
 * Persistence behind one interface, so that adding a Rails backend later is an
 * adapter, not a rewrite.
 *
 * Every adapter is allowed to fail. A learner in a private window with blocked storage
 * must still be able to read lessons — they just will not keep progress. That is why
 * `createStore()` degrades through IndexedDB → localStorage → memory rather than throwing.
 */

export interface Store {
  readonly kind: 'indexeddb' | 'localstorage' | 'memory'
  /** True when writes survive a reload. The UI tells the learner when they do not. */
  readonly durable: boolean
  get<T>(key: string): Promise<T | null>
  set<T>(key: string, value: T): Promise<void>
  delete(key: string): Promise<void>
  keys(prefix?: string): Promise<string[]>
  entries<T>(prefix?: string): Promise<Array<[string, T]>>
  clear(): Promise<void>
}

/* ------------------------------------------------------------------- memory */

export class MemoryStore implements Store {
  readonly kind = 'memory' as const
  readonly durable = false
  #map = new Map<string, unknown>()

  async get<T>(key: string): Promise<T | null> {
    return (this.#map.get(key) as T | undefined) ?? null
  }
  async set<T>(key: string, value: T): Promise<void> {
    this.#map.set(key, structuredClone(value))
  }
  async delete(key: string): Promise<void> {
    this.#map.delete(key)
  }
  async keys(prefix = ''): Promise<string[]> {
    return [...this.#map.keys()].filter((k) => k.startsWith(prefix))
  }
  async entries<T>(prefix = ''): Promise<Array<[string, T]>> {
    return [...this.#map.entries()]
      .filter(([k]) => k.startsWith(prefix))
      .map(([k, v]) => [k, v as T])
  }
  async clear(): Promise<void> {
    this.#map.clear()
  }
}

/* ------------------------------------------------------------- localStorage */

const LS_PREFIX = 'rubiq:'

export class LocalStorageStore implements Store {
  readonly kind = 'localstorage' as const
  readonly durable = true

  static available(): boolean {
    try {
      const probe = '__rubiq_probe__'
      localStorage.setItem(probe, '1')
      localStorage.removeItem(probe)
      return true
    } catch {
      return false
    }
  }

  async get<T>(key: string): Promise<T | null> {
    try {
      const raw = localStorage.getItem(LS_PREFIX + key)
      return raw === null ? null : (JSON.parse(raw) as T)
    } catch {
      return null
    }
  }
  async set<T>(key: string, value: T): Promise<void> {
    try {
      localStorage.setItem(LS_PREFIX + key, JSON.stringify(value))
    } catch {
      // Quota exceeded. Dropping a progress write is strictly better than a crash.
    }
  }
  async delete(key: string): Promise<void> {
    try {
      localStorage.removeItem(LS_PREFIX + key)
    } catch { /* ignore */ }
  }
  async keys(prefix = ''): Promise<string[]> {
    const out: string[] = []
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const raw = localStorage.key(i)
        if (raw?.startsWith(LS_PREFIX + prefix)) out.push(raw.slice(LS_PREFIX.length))
      }
    } catch { /* ignore */ }
    return out
  }
  async entries<T>(prefix = ''): Promise<Array<[string, T]>> {
    const out: Array<[string, T]> = []
    for (const key of await this.keys(prefix)) {
      const value = await this.get<T>(key)
      if (value !== null) out.push([key, value])
    }
    return out
  }
  async clear(): Promise<void> {
    for (const key of await this.keys()) await this.delete(key)
  }
}

/* ---------------------------------------------------------------- IndexedDB */

const DB_NAME = 'rubiq'
const DB_VERSION = 1
const OBJECT_STORE = 'kv'

export class IndexedDbStore implements Store {
  readonly kind = 'indexeddb' as const
  readonly durable = true
  #db: IDBDatabase

  private constructor(db: IDBDatabase) {
    this.#db = db
  }

  static open(): Promise<IndexedDbStore> {
    return new Promise((resolve, reject) => {
      if (typeof indexedDB === 'undefined') {
        reject(new Error('IndexedDB unavailable'))
        return
      }
      const request = indexedDB.open(DB_NAME, DB_VERSION)
      request.onupgradeneeded = () => {
        const db = request.result
        if (!db.objectStoreNames.contains(OBJECT_STORE)) db.createObjectStore(OBJECT_STORE)
      }
      request.onsuccess = () => resolve(new IndexedDbStore(request.result))
      request.onerror = () => reject(request.error ?? new Error('IndexedDB open failed'))
      // Safari in private mode can hang here rather than erroring.
      setTimeout(() => reject(new Error('IndexedDB open timed out')), 3000)
    })
  }

  #tx<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest): Promise<T> {
    return new Promise((resolve, reject) => {
      const tx = this.#db.transaction(OBJECT_STORE, mode)
      const request = fn(tx.objectStore(OBJECT_STORE))
      request.onsuccess = () => resolve(request.result as T)
      request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed'))
    })
  }

  async get<T>(key: string): Promise<T | null> {
    const value = await this.#tx<T | undefined>('readonly', (s) => s.get(key))
    return value ?? null
  }
  async set<T>(key: string, value: T): Promise<void> {
    await this.#tx('readwrite', (s) => s.put(value, key))
  }
  async delete(key: string): Promise<void> {
    await this.#tx('readwrite', (s) => s.delete(key))
  }
  async keys(prefix = ''): Promise<string[]> {
    const all = await this.#tx<IDBValidKey[]>('readonly', (s) => s.getAllKeys())
    return all.map(String).filter((k) => k.startsWith(prefix))
  }
  async entries<T>(prefix = ''): Promise<Array<[string, T]>> {
    const keys = await this.keys(prefix)
    const values = await Promise.all(keys.map((k) => this.get<T>(k)))
    return keys
      .map((k, i) => [k, values[i]] as [string, T | null])
      .filter((pair): pair is [string, T] => pair[1] !== null)
  }
  async clear(): Promise<void> {
    await this.#tx('readwrite', (s) => s.clear())
  }
}

/* ---------------------------------------------------------------- selection */

let storePromise: Promise<Store> | null = null

/** Pick the best adapter this browser will actually let us use. */
export function createStore(): Promise<Store> {
  storePromise ??= (async (): Promise<Store> => {
    try {
      const db = await IndexedDbStore.open()
      // Prove it works before committing — an open handle is not a working handle.
      await db.set('__probe__', 1)
      await db.delete('__probe__')
      return db
    } catch {
      /* fall through */
    }
    if (LocalStorageStore.available()) return new LocalStorageStore()
    return new MemoryStore()
  })()
  return storePromise
}

/** Tests and Storybook-style previews inject their own. */
export function __setStoreForTests(store: Store | null): void {
  storePromise = store ? Promise.resolve(store) : null
}
