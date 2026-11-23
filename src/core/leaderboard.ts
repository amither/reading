import type { TaskId } from '../types'
import { elapsedDays } from './period'

export interface BoardEntry {
  name: string
  days: number
  rank: number
  isMe: boolean
  avatarKind: 'default' | 'color'
  color: string
}

export interface BoardInput {
  names: string[]
  taskId: TaskId
  today: string
  hour: number // 本地小时 0-23，用于“当天实时感”
  me: { name: string; days: number }
}

const COLORS = ['#F28B82', '#FBBC04', '#81C995', '#78D9EC', '#8AB4F8', '#C58AF9', '#FF8BCB', '#F6AEA9', '#A7D8A0', '#FFB870']

export function hashString(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function avatarOf(name: string): Pick<BoardEntry, 'avatarKind' | 'color'> {
  const h = hashString('avatar|' + name)
  return { avatarKind: h % 100 < 40 ? 'default' : 'color', color: COLORS[(h >>> 8) % COLORS.length] }
}

function virtualDays(name: string, taskId: TaskId, today: string, hour: number): number {
  const n = elapsedDays(today)
  const rng = mulberry32(hashString(`${today}|${taskId}|${name}`))
  const low = Math.max(0, n - 2)
  let days = low + Math.round((n - low) * Math.sqrt(rng())) // sqrt 使分布偏向高值
  const finishHour = 6 + Math.floor(rng() * 16) // 今天打卡完成的时刻 6~21 点
  if (days > 0 && finishHour > hour) days -= 1 // 还没到点，今天这一卡暂不计入
  return days
}

export function buildLeaderboard(input: BoardInput): BoardEntry[] {
  const { names, taskId, today, hour, me } = input
  const tie = (name: string) => hashString(`${today}|${taskId}|tie|${name}`)
  const raw = [
    ...names.filter((n) => n !== me.name).map((name) => ({ name, days: virtualDays(name, taskId, today, hour), isMe: false })),
    { name: me.name, days: me.days, isMe: true },
  ]
  raw.sort((a, b) => b.days - a.days || tie(a.name) - tie(b.name))
  let rank = 0
  let prev = -1
  return raw.map((e) => {
    if (e.days !== prev) { rank += 1; prev = e.days }
    return { ...e, rank, ...avatarOf(e.name) }
  })
}
