<script setup lang="ts">
import { computed } from 'vue'
import { state } from '../store'
import { TASK_IDS, dayStatus, streakDays } from '../core/checkin'
import { elapsedDays } from '../core/period'

const cards = computed(() =>
  TASK_IDS.map((id) => ({
    id,
    title: state.settings.tasks[id].title,
    elapsed: elapsedDays(state.today),
    days: streakDays(state.checkins, id, state.today),
    done: dayStatus(state.checkins, id, state.today, state.today) === 'done',
  })),
)
</script>

<template>
  <div class="page">
    <h2 class="head">阅读打卡</h2>
    <router-link v-for="c in cards" :key="c.id" :to="`/task/${c.id}`" class="task card">
      <div class="row">
        <strong class="title">{{ c.title }}</strong>
        <span class="badge blue">已进行{{ c.elapsed }}/7天</span>
      </div>
      <div class="row sub">
        <span class="badge green">本周已坚持{{ c.days }}天</span>
        <span :class="c.done ? 'ok' : 'todo'">{{ c.done ? '今日已打卡 ✓' : '今日未打卡' }}</span>
      </div>
    </router-link>
  </div>
</template>

<style scoped>
.head { margin: 0; padding: 20px 16px 12px; }
.task { display: block; margin: 0 0 12px; color: inherit; text-decoration: none; }
.row { display: flex; justify-content: space-between; align-items: center; }
.title { font-size: 20px; }
.sub { margin-top: 14px; }
.ok { color: #43B581; }
.todo { color: #e5534b; }
</style>
