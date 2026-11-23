<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { state } from '../store'
import { streakDays } from '../core/checkin'
import { getAudio } from '../storage/repo'
import Avatar from '../components/Avatar.vue'
import AudioPlayer from '../components/AudioPlayer.vue'
import QuizReview from '../components/QuizReview.vue'
import { quizScore } from '../core/quiz'
import type { TaskId } from '../types'

const route = useRoute()
const router = useRouter()
const taskId = route.params.id as TaskId
const date = route.params.date as string
const checkin = computed(() => state.checkins.find((c) => c.taskId === taskId && c.date === date))
const blob = ref<Blob | null>(null)
const streak = computed(() => streakDays(state.checkins, taskId, state.today))
const name = computed(() => state.settings.name || '我')
const klass = computed(() => state.settings.grade + state.settings.className)
const score = computed(() => quizScore(checkin.value?.quiz))
const when = computed(() => {
  if (!checkin.value) return ''
  const d = new Date(checkin.value.submittedAt)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
})

onMounted(async () => {
  if (!checkin.value) return
  const a = await getAudio(checkin.value.audioId)
  if (a) blob.value = new Blob([a.data], { type: a.mimeType })
})
</script>

<template>
  <div class="page">
    <div class="top"><button class="back" @click="router.back()">‹</button><span>打卡记录</span></div>
    <div v-if="checkin" class="card">
      <div class="who">
        <Avatar :name="name" :size="52" color="#8AB4F8" />
        <div class="info">
          <div><strong class="name">{{ name }}</strong> <span class="streak">已坚持{{ streak }}天</span></div>
          <div class="muted">{{ klass }}</div>
        </div>
        <div class="muted time">{{ when }}<br /><span v-if="checkin.isMakeup">补卡</span></div>
      </div>
      <div class="audio">
        <AudioPlayer v-if="blob" :blob="blob" :duration-sec="checkin.durationSec" />
        <p v-else class="muted">录音不存在或已丢失</p>
      </div>
      <template v-if="checkin.quiz">
        <div class="quiz-sum">
          <span>阅读小测：答对 {{ score.right }}/{{ score.total }}<template v-if="score.answered < score.total">（还有 {{ score.total - score.answered }} 题没答）</template></span>
          <router-link v-if="score.answered < score.total" :to="`/task/${taskId}/quiz/${date}`">去答题</router-link>
        </div>
        <QuizReview :quiz="checkin.quiz" class="quiz-review" />
      </template>
    </div>
    <div v-else class="card muted">没有这天的打卡记录</div>
    <div class="bottom-bar"><div class="end">{{ date < state.today ? '已过打卡日期' : '今日已打卡' }}</div></div>
  </div>
</template>

<style scoped>
.who { display: flex; gap: 12px; align-items: center; }
.info { flex: 1; }
.name { font-size: 20px; }
.streak { color: #43c7a8; font-size: 15px; }
.time { text-align: right; }
.audio { margin: 16px 0 0 64px; }
.quiz-sum { display: flex; justify-content: space-between; align-items: center; gap: 12px; margin: 16px 0 0 64px; padding: 12px 14px; border-radius: 12px; background: #fff8e6; font-size: 17px; }
.quiz-sum a { color: #3a7bd5; text-decoration: none; font-weight: 600; white-space: nowrap; }
.quiz-review { margin-top: 12px; }
.end { text-align: center; color: #bbb; font-size: 20px; padding: 10px; }
</style>
