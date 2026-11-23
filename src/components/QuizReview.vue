<script setup lang="ts">
import type { QuizData } from '../types'

defineProps<{ quiz: QuizData }>()
const LABELS = ['A', 'B', 'C']
// 还没答的题不亮出答案和讲解，避免孩子先看答案再去答题
const answered = (quiz: QuizData, qi: number) => quiz.picks[qi] !== null && quiz.picks[qi] !== undefined
</script>

<template>
  <ol class="review">
    <li v-for="(q, qi) in quiz.questions" :key="qi" class="item">
      <div class="q">{{ qi + 1 }}. {{ q.q }}</div>
      <div
        v-for="(o, oi) in q.options"
        :key="oi"
        class="opt"
        :class="{ right: answered(quiz, qi) && oi === q.answer, wrong: quiz.picks[qi] === oi && oi !== q.answer }"
      >
        <b>{{ LABELS[oi] }}</b>
        <span class="text">{{ o }}</span>
        <span v-if="answered(quiz, qi) && oi === q.answer" class="tag ok">正确答案</span>
        <span v-if="quiz.picks[qi] === oi" class="tag mine">你选的</span>
      </div>
      <div v-if="!answered(quiz, qi)" class="skipped">这道题还没有回答</div>
      <div v-if="answered(quiz, qi) && q.explain" class="explain">💡 {{ q.explain }}</div>
    </li>
  </ol>
</template>

<style scoped>
.review { list-style: none; margin: 0; padding: 0; }
.item { padding: 14px 0; border-top: 1px dashed #e5e5e5; }
.item:first-child { border-top: 0; }
.q { font-size: 20px; font-weight: 600; line-height: 1.5; margin-bottom: 10px; }
.opt { display: flex; align-items: center; gap: 10px; margin-bottom: 8px; padding: 10px 12px; border: 2px solid #e3e9f3; border-radius: 12px; background: #f8faff; font-size: 18px; }
.opt b { flex: none; width: 30px; height: 30px; line-height: 30px; text-align: center; border-radius: 50%; background: #9db4d8; color: #fff; font-size: 16px; }
.opt .text { flex: 1; }
.opt.right { border-color: #43B581; background: #e8f8f0; }
.opt.right b { background: #43B581; }
.opt.wrong { border-color: #e5534b; background: #fdeceb; }
.opt.wrong b { background: #e5534b; }
.tag { flex: none; font-size: 14px; padding: 2px 8px; border-radius: 10px; }
.tag.ok { background: #43B581; color: #fff; }
.tag.mine { background: #fff; color: #555; border: 1px solid #bbb; }
.skipped { color: #e08a00; font-size: 16px; margin: 4px 0; }
.explain { margin-top: 6px; padding: 10px 12px; border-radius: 10px; background: #fff8e6; font-size: 17px; line-height: 1.6; }
</style>
