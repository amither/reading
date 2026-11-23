export type TaskId = 'chinese' | 'english'

export interface Checkin {
  taskId: TaskId
  date: string // YYYY-MM-DD，本地时区
  submittedAt: number // 真实提交时间戳
  isMakeup: boolean
  durationSec: number
  audioId: string
}

export interface AudioRecord {
  id: string
  data: ArrayBuffer
  mimeType: string
  durationSec: number
}

export interface TaskText {
  title: string
  author: string
  desc: string
}

export interface Settings {
  name: string
  grade: string
  className: string
  tasks: Record<TaskId, TaskText>
}

export interface Meta {
  a2hsPrompted: boolean
}
