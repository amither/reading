<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { answerQuiz, jobKey, state } from '../store'
import { quizScore } from '../core/quiz'
import type { TaskId } from '../types'

const route = useRoute()
const router = useRouter()
const taskId = route.params.id as TaskId
const date = route.params.date as string
const LABELS = ['A', 'B', 'C']

const checkin = computed(() => state.checkins.find((c) => c.taskId === taskId && c.date === date))
const quiz = computed(() => checkin.value?.quiz)
const running = computed(() => state.quizJobs[jobKey(taskId, date)] === 'running')
const score = computed(() => quizScore(quiz.value))
const cur = ref(0)

// 题目到达（或进入页面时已有题目）时，定位到第一道没答的题；全答完则直接看结果
watch(
  quiz,
  (q, old) => {
    if (q && !old) {
      const first = q.picks.findIndex((p) => p === null)
      cur.value = first === -1 ? q.questions.length : first
    }
  },
  { immediate: true },
)

const total = computed(() => quiz.value?.questions.length ?? 0)
const question = computed(() => (quiz.value && cur.value < total.value ? quiz.value.questions[cur.value] : null))
const pick = computed(() => quiz.value?.picks[cur.value] ?? null)

function choose(i: number) {
  if (pick.value === null) void answerQuiz(taskId, date, cur.value, i)
}
function next() {
  cur.value += 1
}
function leave() {
  router.replace(`/task/${taskId}`)
}
</script>

<template>
  <div class="page">
    <div class="top"><button class="back" @click="leave">‹</button><span>阅读小测</span></div>

    <div v-if="question" class="card">
      <div class="progress muted">第 {{ cur + 1 }} / {{ total }} 题</div>
      <h2 class="qtext">{{ question.q }}</h2>
      <button
        v-for="(o, i) in question.options"
        :key="i"
        class="opt"
        :class="{ right: pick !== null && i === question.answer, wrong: pick !== null && i === pick && pick !== question.answer }"
        :disabled="pick !== null"
        @click="choose(i)"
      >
        <b>{{ LABELS[i] }}</b><span>{{ o }}</span>
      </button>
      <div v-if="pick !== null" class="feedback" :class="pick === question.answer ? 'ok' : 'no'">
        <div class="verdict">{{ pick === question.answer ? '答对啦！🎉' : '再想想～' }}</div>
        <div v-if="question.explain">{{ question.explain }}</div>
      </div>
    </div>

    <div v-else-if="quiz" class="card center">
      <div class="big">🌟</div>
      <h2>答对 {{ score.right }}/{{ score.total }}</h2>
    </div>

    <div v-else-if="running" class="card center">
      <div class="big spin">⭐</div>
      <h2>正在出题…</h2>
      <p class="muted">读得真棒！老师在想问题呢</p>
    </div>

    <div v-else class="card center">
      <h2>这次没有题目</h2>
    </div>

    <div class="bottom-bar">
      <button v-if="question && pick !== null" class="btn green" @click="next">{{ cur + 1 < total ? '下一题' : '完成' }}</button>
      <button v-else-if="!question" class="btn" @click="leave">{{ running ? '先不答题' : '回到打卡页' }}</button>
    </div>
  </div>
</template>

<style scoped>
.card { margin: 12px; border-radius: 20px; }
.center { text-align: center; padding: 40px 16px; }
.big { font-size: 72px; }
.spin { display: inline-block; animation: spin 1.6s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
.qtext { font-size: 26px; line-height: 1.5; margin: 8px 0 20px; }
.opt { display: flex; align-items: center; gap: 14px; width: 100%; margin-bottom: 14px; padding: 16px 18px; min-height: 68px; border: 3px solid #d9e4f5; border-radius: 16px; background: #f6f9ff; font-size: 24px; text-align: left; color: #222; }
.opt b { flex: none; width: 40px; height: 40px; line-height: 40px; text-align: center; border-radius: 50%; background: #3a7bd5; color: #fff; font-size: 22px; }
.opt:disabled { opacity: 1; }
.opt.right { border-color: #43B581; background: #e8f8f0; }
.opt.right b { background: #43B581; }
.opt.wrong { border-color: #e5534b; background: #fdeceb; }
.opt.wrong b { background: #e5534b; }
.feedback { margin-top: 8px; padding: 14px 16px; border-radius: 14px; font-size: 20px; line-height: 1.6; }
.feedback.ok { background: #e8f8f0; }
.feedback.no { background: #fff4e0; }
.verdict { font-weight: 700; font-size: 24px; margin-bottom: 4px; }
</style>
