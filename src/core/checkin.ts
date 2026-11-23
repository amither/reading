import type { Checkin, TaskId } from '../types'
import { periodOf } from './period'

export const TASK_IDS: TaskId[] = ['chinese', 'english']
export const MAKEUP_LIMIT = 3

export type DayStatus = 'done' | 'missed' | 'today' | 'future'
export type CanCheckin = { ok: true; isMakeup: boolean } | { ok: false; reason: string }

export function periodCheckins(all: Checkin[], taskId: TaskId, today: string): Checkin[] {
  const days = new Set(periodOf(today))
  return all.filter((c) => c.taskId === taskId && days.has(c.date))
}

export function streakDays(all: Checkin[], taskId: TaskId, today: string): number {
  return periodCheckins(all, taskId, today).length
}

export function makeupUsed(all: Checkin[], taskId: TaskId, today: string): number {
  return periodCheckins(all, taskId, today).filter((c) => c.isMakeup).length
}

export function dayStatus(all: Checkin[], taskId: TaskId, date: string, today: string): DayStatus {
  if (all.some((c) => c.taskId === taskId && c.date === date)) return 'done'
  if (date > today) return 'future'
  if (date === today) return 'today'
  return 'missed'
}

export function canCheckin(all: Checkin[], taskId: TaskId, date: string, today: string): CanCheckin {
  if (!periodOf(today).includes(date)) return { ok: false, reason: '只能补本周的打卡' }
  const status = dayStatus(all, taskId, date, today)
  if (status === 'done') return { ok: false, reason: '已打卡' }
  if (status === 'future') return { ok: false, reason: '还没到打卡日期' }
  if (status === 'today') return { ok: true, isMakeup: false }
  if (makeupUsed(all, taskId, today) >= MAKEUP_LIMIT) return { ok: false, reason: '本周补卡次数已用完' }
  return { ok: true, isMakeup: true }
}
