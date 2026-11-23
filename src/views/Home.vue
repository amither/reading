<script setup lang="ts">
import { computed } from 'vue'
import { state } from '../store'
import { TASK_IDS, dayStatus, streakDays } from '../core/checkin'
import { elapsedDays } from '../core/period'

// 每成功打卡一次（含补卡）累计一颗星，由打卡记录数得出
const stars = computed(() => state.checkins.length)

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
  <div class="page home">
    <div class="top">
      <div class="stars" :aria-label="`已获得${stars}颗星星`">⭐<b>{{ stars }}</b></div>
      <span class="spacer"></span>
      <strong class="app-title">阅读打卡</strong>
      <span class="spacer"></span>
      <router-link to="/settings" class="gear" aria-label="设置">⚙️</router-link>
    </div>
    <div class="list"><router-link v-for="c in cards" :key="c.id" :to="`/task/${c.id}`" class="task card" :class="c.id">
      <div class="row">
        <strong class="title"><span class="ico">{{ c.id === 'chinese' ? '📖' : '🔤' }}</span>{{ c.title }}</strong>
        <span class="badge blue">已进行{{ c.elapsed }}/7天</span>
      </div>
      <div class="row sub">
        <span class="badge green">本周已坚持{{ c.days }}天</span>
        <span :class="c.done ? 'ok' : 'todo'">{{ c.done ? '今日已打卡 ✓' : '今日未打卡' }}</span>
      </div>
    </router-link></div>
  </div>
</template>

<style scoped>
.list { padding: 12px; }
.task { display: block; margin: 0 0 16px; color: inherit; text-decoration: none; border-radius: 20px; padding: 20px; box-shadow: 0 2px 8px rgba(0,0,0,.06); }
.row { display: flex; justify-content: space-between; align-items: center; gap: 8px; flex-wrap: wrap; }
.title { font-size: 26px; display: flex; align-items: center; gap: 10px; }
.ico { font-size: 38px; }
.sub { margin-top: 18px; }
.ok { color: #43B581; font-size: 20px; }
.todo { color: #e5534b; font-size: 20px; }
.app-title { font-size: 26px; }
.stars { display: flex; align-items: center; gap: 6px; padding: 4px 16px 4px 12px; border-radius: 24px; background: #fff4cc; font-size: 28px; line-height: 1; min-width: 52px; height: 52px; }
.stars b { font-size: 26px; color: #e08a00; font-variant-numeric: tabular-nums; }

/* 横屏（iPad 横着拿）：两张任务卡片左右排列，做成大卡片 */
@media (orientation: landscape) and (min-width: 900px) {
  .list { display: grid; grid-template-columns: 1fr 1fr; gap: 28px; padding: 28px; }
  .task { margin: 0; min-height: min(62vh, 560px); padding: 40px; border-radius: 32px; display: flex; flex-direction: column; justify-content: space-between; box-shadow: 0 6px 20px rgba(0,0,0,.08); }
  .task.chinese { background: linear-gradient(160deg, #fff 0%, #fff4e0 100%); }
  .task.english { background: linear-gradient(160deg, #fff 0%, #e6f1ff 100%); }
  .task .row { flex-direction: column; align-items: flex-start; gap: 18px; }
  .title { font-size: 44px; gap: 18px; }
  .ico { font-size: 84px; }
  .task .badge { font-size: 22px; padding: 6px 18px; }
  .sub { margin-top: 0; }
  .ok, .todo { font-size: 28px; font-weight: 600; }
}
</style>
