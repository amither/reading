import type { QuizData, QuizQuestion, TaskId } from '../types'

export const MAX_QUESTIONS = 3
const MIN_UNITS = 20

/** 识别文字太短就不出题：中文按字、英文按词 */
export function enoughText(text: string): boolean {
  const cjk = (text.match(/[一-鿿]/g) ?? []).length
  const words = (text.replace(/[一-鿿]/g, ' ').match(/[A-Za-z']+/g) ?? []).length
  return cjk + words >= MIN_UNITS
}

/** 解析并校验模型返回的题目，不合格的题直接丢弃，最多保留 3 题 */
export function parseQuiz(raw: string): QuizQuestion[] {
  const text = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')
  let data: any
  try {
    data = JSON.parse(text)
  } catch {
    return []
  }
  const list = Array.isArray(data) ? data : data?.questions
  if (!Array.isArray(list)) return []
  const out: QuizQuestion[] = []
  for (const it of list) {
    const q = typeof it?.q === 'string' ? it.q.trim() : ''
    const options: string[] = Array.isArray(it?.options) ? it.options.map((o: unknown) => String(o).trim()) : []
    const answer = Number(it?.answer)
    const explain = typeof it?.explain === 'string' ? it.explain.trim() : ''
    if (!q || options.length !== 3 || options.some((o) => !o)) continue
    if (!Number.isInteger(answer) || answer < 0 || answer > 2) continue
    if (new Set(options).size !== 3) continue
    out.push({ q, options, answer, explain })
    if (out.length === MAX_QUESTIONS) break
  }
  return out
}

/** 打乱选项顺序，避免模型总把正确答案放在同一个位置 */
export function shuffleQuestion(q: QuizQuestion, rng: () => number = Math.random): QuizQuestion {
  const idx = [0, 1, 2]
  for (let i = 2; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[idx[i], idx[j]] = [idx[j], idx[i]]
  }
  return { ...q, options: idx.map((i) => q.options[i]), answer: idx.indexOf(q.answer) }
}

export function quizScore(quiz?: QuizData): { right: number; answered: number; total: number } {
  if (!quiz) return { right: 0, answered: 0, total: 0 }
  let right = 0
  let answered = 0
  quiz.questions.forEach((q, i) => {
    const p = quiz.picks[i]
    if (p !== null && p !== undefined) {
      answered += 1
      if (p === q.answer) right += 1
    }
  })
  return { right, answered, total: quiz.questions.length }
}

export function buildMessages(transcript: string, taskId: TaskId, grade = ''): { role: 'system' | 'user'; content: string }[] {
  const lang =
    taskId === 'english'
      ? '孩子读的是英语，题干用简单中文，需要时可以引用原文里的英文单词。'
      : '孩子读的是语文内容，题干用简单中文。'
  const g = grade.trim()
  const level = g ? `${g}的孩子` : '小学生'
  const system = [
    `你是小学生的阅读老师。${g ? `孩子的年级是${g}，题目的难度和用词要符合这个年级的水平。` : '题目要简单，适合小学生。'}根据孩子刚才朗读内容的语音识别文字，出最多3道单项选择题，考察内容理解和简单的思考。`,
    '题目分两类：内容题，答案在文中能直接找到（谁、做了什么、在哪里）；思考题，文中没有直接写出答案，要想一想才能答（比如为什么、接下来可能会怎样、人物此刻的心情、这件事告诉我们什么）。每次出题至少要有1道思考题，其余可以是内容题。',
    '思考题的正确答案必须能从文中的内容合理推出，只有1个说得通，另外2个明显不合理，不要出没有标准答案的开放题。',
    lang,
    `要求：每题恰好3个选项，只有1个正确；题干和选项都用${level}能看懂的短句；识别文字可能有错别字或断句错误，请忽略这些错误，只依据能确定的内容出题；如果内容太少或太乱，出的题可以少于3道，甚至返回空数组。`,
    '只输出 json，格式如下：{"questions":[{"q":"题干","options":["选项A","选项B","选项C"],"answer":0,"explain":"一句话讲解"}]}，其中 answer 是正确选项的下标（0到2）。',
  ].join('\n')
  return [
    { role: 'system', content: system },
    { role: 'user', content: `识别文字：\n${transcript}` },
  ]
}
