<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { state } from '../store'
import { streakDays } from '../core/checkin'
import { elapsedDays } from '../core/period'
import { buildLeaderboard } from '../core/leaderboard'
import { DEFAULT_NAMES } from '../core/defaultNames'
import Avatar from '../components/Avatar.vue'
import type { TaskId } from '../types'

const route = useRoute()
const router = useRouter()
const taskId = route.params.id as TaskId
const medals = ['#f6c344', '#9ec3dc', '#f0884a']

const board = computed(() =>
  buildLeaderboard({
    names: state.roster?.length ? state.roster : DEFAULT_NAMES,
    taskId,
    today: state.today,
    hour: new Date().getHours(),
    me: { name: state.settings.name || '我', days: streakDays(state.checkins, taskId, state.today) },
  }),
)
</script>

<template>
  <div class="page">
    <div class="top"><button class="back" @click="router.back()">‹</button><span>排行榜</span></div>
    <div class="sub"><span>坚持打卡天数计算排名</span><span><b>{{ elapsedDays(state.today) }}</b>/7天</span></div>
    <div class="list">
      <div v-for="e in board" :key="e.name" class="row" :class="{ me: e.isMe }">
        <div class="rank">
          <span v-if="e.rank <= 3" class="medal" :style="{ background: medals[e.rank - 1] }">{{ e.rank }}</span>
          <span v-else>{{ e.rank }}</span>
        </div>
        <Avatar :name="e.name" :kind="e.avatarKind" :color="e.color" :size="44" />
        <div class="name">{{ e.name }}<small v-if="e.isMe">（我）</small></div>
        <div class="days">已坚持<b>{{ e.days }}</b>天</div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.sub { display: flex; justify-content: space-between; padding: 10px 16px; color: #999; font-size: 14px; }
.sub b { color: #3a7bd5; font-weight: 400; }
.list { background: #fff; }
.row { display: flex; align-items: center; gap: 14px; padding: 12px 16px; }
.row.me { background: #fff8e6; }
.rank { width: 32px; text-align: center; }
.medal { display: inline-block; width: 30px; height: 30px; line-height: 30px; border-radius: 50%; color: #fff; font-weight: 700; }
.name { flex: 1; font-size: 18px; }
.name small { color: #e08a00; }
.days { color: #999; }
.days b { color: #f2a33a; font-weight: 400; }
</style>
