import { describe, it, expect } from 'vitest'
import { buildMessages, enoughText, parseQuiz, quizScore, shuffleQuestion } from '../../src/core/quiz'
import type { QuizQuestion } from '../../src/types'

const good = { q: '小兔子喜欢吃什么？', options: ['胡萝卜', '石头', '铅笔'], answer: 0, explain: '小兔子爱吃胡萝卜。' }

describe('enoughText', () => {
  it('rejects short text', () => expect(enoughText('小兔子你好')).toBe(false))
  it('accepts 20 Chinese characters', () => expect(enoughText('小兔子在草地上快乐地跳来跳去找好吃的胡萝卜')).toBe(true))
  it('counts English words', () => expect(enoughText('the little rabbit likes to eat carrots and jump on the green grass every single day and then he goes home to sleep well')).toBe(true))
  it('does not accept 19 characters', () => expect(enoughText('一二三四五六七八九十一二三四五六七八九')).toBe(false))
})

describe('parseQuiz', () => {
  it('parses a valid object', () => {
    expect(parseQuiz(JSON.stringify({ questions: [good] }))).toEqual([good])
  })
  it('accepts a bare array and code fences', () => {
    expect(parseQuiz('```json\n' + JSON.stringify([good]) + '\n```')).toEqual([good])
  })
  it('drops invalid questions', () => {
    const bad = [
      { ...good, options: ['a', 'b'] },
      { ...good, answer: 3 },
      { ...good, answer: 'x' },
      { ...good, options: ['a', 'a', 'b'] },
      { ...good, q: '  ' },
      { ...good, options: ['a', '', 'b'] },
    ]
    expect(parseQuiz(JSON.stringify({ questions: [...bad, good] }))).toEqual([good])
  })
  it('keeps at most 3 questions', () => {
    expect(parseQuiz(JSON.stringify({ questions: [good, good, good, good] }))).toHaveLength(3)
  })
  it('returns [] for garbage, blanks and wrong shapes', () => {
    expect(parseQuiz('not json')).toEqual([])
    expect(parseQuiz('     ')).toEqual([])
    expect(parseQuiz('{"questions":"x"}')).toEqual([])
    expect(parseQuiz('{"questions":[]}')).toEqual([])
  })
})

describe('shuffleQuestion', () => {
  it('keeps the correct option text and is a permutation', () => {
    for (const seed of [0, 0.2, 0.5, 0.8, 0.99]) {
      const q = shuffleQuestion(good, () => seed)
      expect(q.options[q.answer]).toBe('胡萝卜')
      expect([...q.options].sort()).toEqual([...good.options].sort())
    }
  })
})

describe('quizScore', () => {
  const questions: QuizQuestion[] = [good, { ...good, answer: 1 }, { ...good, answer: 2 }]
  it('counts answered and right', () => {
    expect(quizScore({ questions, picks: [0, 0, null] })).toEqual({ right: 1, answered: 2, total: 3 })
  })
  it('handles no quiz', () => expect(quizScore(undefined)).toEqual({ right: 0, answered: 0, total: 0 }))
})

describe('buildMessages', () => {
  it('asks for json and includes the transcript', () => {
    const m = buildMessages('今天读了小兔子', 'chinese')
    expect(m[0].role).toBe('system')
    expect(m[0].content).toContain('json')
    expect(m[1].content).toContain('今天读了小兔子')
  })
  it('mentions English for the english task', () => {
    expect(buildMessages('hello', 'english')[0].content).toContain('英语')
  })
  it('requires at least one thinking question in both tasks', () => {
    for (const task of ['chinese', 'english'] as const) {
      const sys = buildMessages('x', task)[0].content
      expect(sys).toContain('至少要有1道思考题')
      expect(sys).toContain('只有1个说得通')
    }
  })
})
