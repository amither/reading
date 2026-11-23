import { openDB, type DBSchema, type IDBPDatabase } from 'idb'
import type { AudioRecord, Checkin } from '../types'

interface ReadingDB extends DBSchema {
  checkins: { key: [string, string]; value: Checkin }
  audios: { key: string; value: AudioRecord }
  kv: { key: string; value: unknown }
}

let dbPromise: Promise<IDBPDatabase<ReadingDB>> | null = null

export function getDb() {
  dbPromise ??= openDB<ReadingDB>('reading-checkin', 1, {
    upgrade(db) {
      db.createObjectStore('checkins', { keyPath: ['taskId', 'date'] })
      db.createObjectStore('audios', { keyPath: 'id' })
      db.createObjectStore('kv')
    },
  })
  return dbPromise
}
