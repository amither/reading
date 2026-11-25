<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { onBeforeRouteLeave, useRoute, useRouter } from 'vue-router'
import { runQuiz, state, submitCheckin } from '../store'
import { LiveAsr } from '../services/liveAsr'
import { Chime } from '../services/chime'
import { canCheckin } from '../core/checkin'
import { MAX_SECONDS, MIN_SECONDS, REMIND_SECONDS, Recorder, type RecordingResult } from '../services/recorder'
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
let live: LiveAsr | null = null

const recorder = new Recorder()
recorder.onTick = (s) => (sec.value = s)
recorder.onAutoStop = () => stop()
// 录音时屏幕是否已保持常亮；null 表示还没开始录音
const awake = ref<boolean | null>(null)
recorder.onAwakeChange = (on) => (awake.value = on)

const fmt = (s: number) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
const verdict = canCheckin(state.checkins, taskId, date, state.today)
const tooShort = computed(() => (result.value?.durationSec ?? 0) < MIN_SECONDS)
// 读到 20 分钟时提醒孩子：快到 30 分钟的上限了，读完就可以结束
const showRemind = computed(() => (phase.value === 'recording' || phase.value === 'paused') && sec.value >= REMIND_SECONDS)
const minutesLeft = computed(() => Math.max(1, Math.ceil((MAX_SECONDS - sec.value) / 60)))
// 提醒出现时响一下提示音
const chime = new Chime()
watch(showRemind, (on) => {
  if (on) chime.play()
})

async function start() {
  chime.prime() // 要在点击的同步流程里，iOS 才允许之后播放声音
  error.value = ''
  try {
    live = state.apiKey ? new LiveAsr(state.apiKey) : null
    recorder.onPcm = live ? (pcm) => live?.push(pcm) : null
    recorder.onPcmUnavailable = () => { live = null }
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
  live?.discard()
  live = null
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
    if (live) {
      void runQuiz(taskId, date, live)
      router.replace(`/task/${taskId}/quiz/${date}`)
    } else {
      router.replace(`/task/${taskId}`)
    }
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
  if (!submitted) live?.discard()
  recorder.cancel()
  chime.close()
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
      <div v-if="showRemind" class="remind" role="status">
        <div class="remind-title">⏰ 已经读了 {{ REMIND_SECONDS / 60 }} 分钟啦，真棒！</div>
        <div>再过 {{ minutesLeft }} 分钟录音会自动停止。读完了就点「读完了」吧。</div>
      </div>

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
      <p v-if="(phase === 'recording' || phase === 'paused') && awake === false" class="muted awake-tip">
        这台设备不能自动保持屏幕常亮。录音时间较长时，请到「设置 → 显示与亮度 → 自动锁定」暂时设为「永不」，以免锁屏中断录音。
      </p>
      <p v-if="error" class="err">{{ error }}</p>
    </div>

    <div v-if="phase === 'stopped'" class="bottom-bar">
      <button class="btn green" :disabled="tooShort || submitting" @click="submit">{{ submitting ? '提交中…' : '提交打卡' }}</button>
    </div>
  </div>
</template>

<style scoped>
.center { margin: 12px; text-align: center; }
.clock { font-size: 56px; font-variant-numeric: tabular-nums; margin: 24px 0 4px; }
.clock.rec { color: #e5534b; }
.mic { width: 180px; height: 180px; border-radius: 50%; border: 0; background: #43B581; color: #fff; font-size: 26px; margin: 32px 0; box-shadow: 0 6px 16px rgba(67,181,129,.4); }
@media (min-width: 700px) { .clock { font-size: 80px; } .mic { width: 220px; height: 220px; font-size: 30px; } }
.ctrl { display: flex; gap: 16px; justify-content: center; margin: 24px 0; }
.review { margin-top: 16px; text-align: left; }
.err { color: #e5534b; font-size: 14px; }
.remind { margin: 16px auto 0; max-width: 560px; padding: 16px 20px; border-radius: 16px; background: #fff4cc; border: 3px solid #f2b705; color: #6b4e00; font-size: 20px; line-height: 1.6; animation: remind-in .4s ease-out, remind-pulse 1.2s ease-in-out .4s 3; }
.remind-title { font-size: 24px; font-weight: 700; margin-bottom: 4px; }
.awake-tip { max-width: 560px; margin: 12px auto 0; line-height: 1.6; }
@keyframes remind-in { from { opacity: 0; transform: translateY(-8px); } to { opacity: 1; transform: none; } }
@keyframes remind-pulse { 50% { transform: scale(1.03); } }
</style>
