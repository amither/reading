import type { AudioRecord, Checkin, Meta, Settings } from '../types'
import { getDb } from './db'

export function defaultSettings(): Settings {
  return {
    name: '',
    grade: '',
    className: '',
    tasks: {
      chinese: {
        title: '大声读语文',
        author: '老师',
        desc: '坚持大声朗读课文和古诗，可以练习发音与断句，对语感的培养很有帮助。遇到不会读的字不用担心，可以查字典看拼音，也可以多听多模仿。自信地读出来吧！',
      },
      english: {
        title: '大声读英语',
        author: '老师',
        desc: '坚持大声朗读英语绘本可以练习发音，对语感的培养也很有帮助。遇到不会读的单词不用担心，可翻看课本或字典查看音标，也可以平时多听多模仿。自信读英语的孩子进步最快！',
      },
    },
  }
}

export async function loadSettings(): Promise<Settings> {
  const db = await getDb()
  const saved = (await db.get('kv', 'settings')) as Settings | undefined
  const d = defaultSettings()
  return saved ? { ...d, ...saved, tasks: { ...d.tasks, ...saved.tasks } } : d
}

export async function saveSettings(s: Settings) {
  await (await getDb()).put('kv', JSON.parse(JSON.stringify(s)), 'settings')
}

export async function loadRoster(): Promise<string[] | null> {
  return (((await (await getDb()).get('kv', 'roster')) as string[] | undefined) ?? null)
}

export async function saveRoster(names: string[] | null) {
  const db = await getDb()
  if (names) await db.put('kv', names, 'roster')
  else await db.delete('kv', 'roster')
}

export async function loadMeta(): Promise<Meta> {
  return ((await (await getDb()).get('kv', 'meta')) as Meta | undefined) ?? { a2hsPrompted: false }
}

export async function saveMeta(m: Meta) {
  await (await getDb()).put('kv', m, 'meta')
}

export async function listCheckins(): Promise<Checkin[]> {
  return (await getDb()).getAll('checkins')
}

/** 同一事务写入打卡记录与录音，保证不会只写一半 */
export async function saveCheckin(c: Checkin, a: AudioRecord) {
  const db = await getDb()
  const tx = db.transaction(['checkins', 'audios'], 'readwrite')
  await Promise.all([tx.objectStore('checkins').put(c), tx.objectStore('audios').put(a), tx.done])
}

export async function getAudio(id: string): Promise<AudioRecord | undefined> {
  return (await getDb()).get('audios', id)
}

/** 清空打卡记录与录音（保留设置和同学名单） */
export async function clearRecords() {
  const db = await getDb()
  const tx = db.transaction(['checkins', 'audios'], 'readwrite')
  await Promise.all([tx.objectStore('checkins').clear(), tx.objectStore('audios').clear(), tx.done])
}
