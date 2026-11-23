export type TaskId = 'chinese' | 'english'

export interface Checkin {
  taskId: TaskId
  date: string // YYYY-MM-DD，本地时区
  submittedAt: number // 真实提交时间戳
  isMakeup: boolean
  durationSec: number
  audioId: string
  transcript?: string // 语音识别出的全文
  quiz?: QuizData
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

export interface QuizQuestion {
  q: string
  options: string[] // 恰好 3 个
  answer: number // 0..2
  explain: string
}

export interface QuizData {
  questions: QuizQuestion[]
  picks: (number | null)[] // 与 questions 等长，未答为 null
}
