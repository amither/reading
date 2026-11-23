<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { state } from '../store'
import { streakDays } from '../core/checkin'
import { getAudio } from '../storage/repo'
import Avatar from '../components/Avatar.vue'
import AudioPlayer from '../components/AudioPlayer.vue'
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
    </div>
    <div v-else class="card muted">没有这天的打卡记录</div>
    <div class="bottom-bar"><div class="end">{{ date < state.today ? '已过打卡日期' : '今日已打卡' }}</div></div>
  </div>
</template>

<style scoped>
.top { display: flex; align-items: center; gap: 8px; padding: 14px 8px; background: #fff; font-weight: 600; }
.back { border: 0; background: none; font-size: 28px; line-height: 1; }
.who { display: flex; gap: 12px; align-items: center; }
.info { flex: 1; }
.name { font-size: 20px; }
.streak { color: #43c7a8; font-size: 15px; }
.time { text-align: right; }
.audio { margin: 16px 0 0 64px; }
.end { text-align: center; color: #bbb; font-size: 20px; padding: 10px; }
</style>
