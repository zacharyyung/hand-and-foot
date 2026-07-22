const DB_NAME = 'hand-and-foot-narration'
const DB_VERSION = 1
const STORE = 'audio'

let dbPromise: Promise<IDBDatabase | null> | null = null

function openDb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null)
  if (dbPromise) return dbPromise

  dbPromise = new Promise((resolve) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE)
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => resolve(null)
  })

  return dbPromise
}

export async function getCachedAudio(key: string): Promise<ArrayBuffer | null> {
  const db = await openDb()
  if (!db) return null

  return new Promise((resolve) => {
    const tx = db.transaction(STORE, 'readonly')
    const store = tx.objectStore(STORE)
    const req = store.get(key)
    req.onsuccess = () => {
      resolve((req.result as ArrayBuffer | undefined) ?? null)
    }
    req.onerror = () => resolve(null)
  })
}

export async function setCachedAudio(key: string, data: ArrayBuffer): Promise<void> {
  const db = await openDb()
  if (!db) return

  await new Promise<void>((resolve) => {
    const tx = db.transaction(STORE, 'readwrite')
    tx.oncomplete = () => resolve()
    tx.onerror = () => resolve()
    tx.objectStore(STORE).put(data, key)
  })
}

export function buildCacheKey(parts: {
  providerId: string
  voiceId: string
  speed: number
  text: string
}): string {
  return `${parts.providerId}:${parts.voiceId}:${parts.speed}:${parts.text}`
}
