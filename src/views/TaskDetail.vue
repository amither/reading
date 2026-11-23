<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { state } from '../store'
import { MAKEUP_LIMIT, canCheckin, dayStatus, makeupUsed, streakDays } from '../core/checkin'
import { periodOf, elapsedDays } from '../core/period'
import { shortDate } from '../core/date'
import type { TaskId } from '../types'

const route = useRoute()
const router = useRouter()
const taskId = route.params.id as TaskId
const text = computed(() => state.settings.tasks[taskId])
const days = computed(() => periodOf(state.today))
const streak = computed(() => streakDays(state.checkins, taskId, state.today))
const left = computed(() => MAKEUP_LIMIT - makeupUsed(state.checkins, taskId, state.today))
const expanded = ref(false)
const selected = ref(state.today)

const cells = computed(() => days.value.map((d) => ({ date: d, status: dayStatus(state.checkins, taskId, d, state.today) })))
const verdict = computed(() => canCheckin(state.checkins, taskId, selected.value, state.today))
const btn = computed(() => {
  const v = verdict.value
  if (v.ok) return { label: v.isMakeup ? `补卡 ${shortDate(selected.value)}` : '打卡', disabled: false }
  return { label: v.reason === '已打卡' ? '已打卡' : v.reason, disabled: true }
})

function tapCell(c: { date: string; status: string }) {
  if (c.status === 'done') router.push(`/task/${taskId}/checkin/${c.date}`)
  else if (c.status !== 'future') selected.value = c.date
}
function go() {
  router.push({ path: `/task/${taskId}/record`, query: { date: selected.value } })
}
</script>

<template>
  <div class="page">
    <div class="top">
      <button class="back" @click="router.back()">‹</button>
      <span>打卡详情</span>
    </div>
    <div class="card">
      <div class="title">
        <strong>{{ text.title }}</strong>
        <span class="badge blue">已进行{{ elapsedDays(state.today) }}/7天</span>
      </div>
      <div class="muted author">{{ text.author }}</div>
      <p class="desc" :class="{ clamp: !expanded }">{{ text.desc }}</p>
      <a class="link" @click="expanded = !expanded">{{ expanded ? '收起' : '展开' }}</a>
      <p class="muted">每天需打卡，允许补卡{{ MAKEUP_LIMIT }}次（本周剩余 {{ left }} 次）</p>
    </div>

    <router-link :to="`/task/${taskId}/rank`" class="card rank">🏆 <span>排行榜</span><i>›</i></router-link>

    <div class="card">
      <div class="title">
        <strong>打卡记录</strong>
        <span class="badge green">已坚持{{ streak }}天</span>
      </div>
      <div class="grid">
        <div v-for="c in cells" :key="c.date" class="cell" :class="[c.status, { sel: c.date === selected && c.status !== 'done' }]" @click="tapCell(c)">
          <div class="tick">✔</div>
          <div class="d">{{ shortDate(c.date).replace(/^0/, '').replace('-0', '-') }}</div>
          <div class="hint">{{ c.status === 'done' ? '查看详情>' : c.status === 'missed' ? '可补卡' : c.status === 'today' ? '今天' : '' }}</div>
        </div>
      </div>
    </div>

    <div class="bottom-bar">
      <button class="btn" :disabled="btn.disabled" @click="go">{{ btn.label }}</button>
    </div>
  </div>
</template>

<style scoped>
.card { margin-bottom: 10px; }
.title { display: flex; align-items: center; gap: 10px; justify-content: space-between; }
.title strong { font-size: 22px; }
.author { margin: 6px 0; }
.desc { margin: 0; line-height: 1.7; font-size: 17px; }
.desc.clamp { display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
.link { color: #3a7bd5; font-size: 17px; }
.rank { display: flex; align-items: center; gap: 10px; color: inherit; text-decoration: none; font-size: 20px; }
.rank span { flex: 1; }
.rank i { color: #bbb; font-style: normal; }
.grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-top: 14px; }
.cell { border: 2px solid #d8d8d8; border-radius: 6px; text-align: center; padding: 8px 0; color: #888; }
.cell .tick { font-size: 30px; color: #e0e0e0; }
.cell.done .tick { color: #3a7bd5; }
.cell.done { border-color: #bcd0ea; }
.cell .d { font-size: 22px; }
@media (min-width: 700px) { .grid { grid-template-columns: repeat(7, 1fr); } .cell .tick { font-size: 38px; } .cell .d { font-size: 24px; } .cell .hint { font-size: 14px; } .title strong { font-size: 28px; } .desc { font-size: 20px; } }
.cell .hint { font-size: 12px; color: #3a7bd5; min-height: 16px; }
.cell.sel { border-color: #43B581; background: #f0fbf5; }
.cell.future { opacity: .5; }
</style>
