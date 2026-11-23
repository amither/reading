import { addDays, parseDateStr } from './date'

/** 返回包含 date 的自然周（周一到周日）的 7 个日期 */
export function periodOf(date: string): string[] {
  const offset = (parseDateStr(date).getDay() + 6) % 7 // 周一=0
  const monday = addDays(date, -offset)
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i))
}

/** 本周已过去的天数（含今天）：周一=1 … 周日=7 */
export function elapsedDays(today: string): number {
  return ((parseDateStr(today).getDay() + 6) % 7) + 1
}
