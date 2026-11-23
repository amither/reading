<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue'
import { onBeforeRouteLeave, useRoute, useRouter } from 'vue-router'
import { state, submitCheckin } from '../store'
import { canCheckin } from '../core/checkin'
import { MAX_SECONDS, MIN_SECONDS, Recorder, type RecordingResult } from '../services/recorder'
import AudioPlayer from '../components/AudioPlayer.vue'
import type { TaskId } from '../types'

const route = useRoute()
const router = useRouter()
const taskId = route.params.id as TaskId
// 录音开始那天为准：进入页面时就锁定日期
const date = (route.query.date as string) || state.today

const phase = ref<'idle' | 'recording' | 'paused' | 'stopped'>('idle')
const sec = ref(0)
const result = ref<RecordingResult | null>(null)
const error = ref('')
const submitting = ref(false)
let submitted = false

const recorder = new Recorder()
recorder.onTick = (s) => (sec.value = s)
recorder.onAutoStop = () => stop()

const fmt = (s: number) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
const verdict = canCheckin(state.checkins, taskId, date, state.today)
const tooShort = computed(() => (result.value?.durationSec ?? 0) < MIN_SECONDS)

async function start() {
  error.value = ''
  try {
    await recorder.start()
    phase.value = 'recording'
  } catch (e: any) {
    error.value = e?.name === 'NotAllowedError'
      ? '没有麦克风权限。请到 系统「设置」→「Safari/本应用」→「麦克风」中允许后重试。'
      : '无法开始录音：' + (e?.message ?? e)
  }
}
function togglePause() {
  if (phase.value === 'recording') { recorder.pause(); phase.value = 'paused' }
  else { recorder.resume(); phase.value = 'recording' }
}
async function stop() {
  if (phase.value !== 'recording' && phase.value !== 'paused') return
  phase.value = 'stopped'
  result.value = await recorder.stop()
}
function redo() {
  result.value = null
  sec.value = 0
  phase.value = 'idle'
}
async function submit() {
  if (!result.value || tooShort.value) return
  submitting.value = true
  try {
    await submitCheckin(taskId, date, result.value)
    submitted = true
    router.replace(`/task/${taskId}`)
  } catch (e: any) {
    error.value = e?.message ?? String(e)
  } finally {
    submitting.value = false
  }
}

onBeforeRouteLeave(() => {
  if (submitted || phase.value === 'idle') return true
  return window.confirm('录音还没有提交，退出会丢失，确定退出吗？')
})
function onVisibility() {
  if (document.hidden && phase.value === 'recording') error.value = '离开页面后录音可能中断，请回到本页检查。'
}
document.addEventListener('visibilitychange', onVisibility)
onBeforeUnmount(() => {
  document.removeEventListener('visibilitychange', onVisibility)
  recorder.cancel()
})
</script>

<template>
  <div class="page">
    <div class="top"><button class="back" @click="router.back()">‹</button><span>朗读打卡 {{ date }}</span></div>
    <div v-if="!verdict.ok" class="card center">
      <p>{{ verdict.reason }}</p>
      <button class="btn small" @click="router.back()">返回</button>
    </div>
    <div v-else class="card center">
      <div class="clock" :class="{ rec: phase === 'recording' }">{{ fmt(sec) }}</div>
      <p class="muted">至少读 {{ MIN_SECONDS }} 秒，最长 {{ MAX_SECONDS / 60 }} 分钟</p>

      <button v-if="phase === 'idle'" class="mic" @click="start">开始录音</button>
      <div v-else-if="phase === 'recording' || phase === 'paused'" class="ctrl">
        <button class="btn small" @click="togglePause">{{ phase === 'recording' ? '暂停' : '继续' }}</button>
        <button class="btn small danger" @click="stop">读完了</button>
      </div>
      <div v-else-if="result" class="review">
        <AudioPlayer :blob="result.blob" :duration-sec="result.durationSec" />
        <p v-if="tooShort" class="err">录音太短（至少 {{ MIN_SECONDS }} 秒），请重录。</p>
        <div class="ctrl">
          <button class="btn small danger" @click="redo">重录</button>
        </div>
      </div>
      <p v-if="error" class="err">{{ error }}</p>
    </div>

    <div v-if="phase === 'stopped'" class="bottom-bar">
      <button class="btn green" :disabled="tooShort || submitting" @click="submit">{{ submitting ? '提交中…' : '提交打卡' }}</button>
    </div>
  </div>
</template>

<style scoped>
.top { display: flex; align-items: center; gap: 8px; padding: 14px 8px; background: #fff; font-weight: 600; }
.back { border: 0; background: none; font-size: 28px; line-height: 1; }
.center { margin: 12px; text-align: center; }
.clock { font-size: 56px; font-variant-numeric: tabular-nums; margin: 24px 0 4px; }
.clock.rec { color: #e5534b; }
.mic { width: 140px; height: 140px; border-radius: 50%; border: 0; background: #43B581; color: #fff; font-size: 20px; margin: 24px 0; }
.ctrl { display: flex; gap: 16px; justify-content: center; margin: 24px 0; }
.review { margin-top: 16px; text-align: left; }
.err { color: #e5534b; font-size: 14px; }
</style>
