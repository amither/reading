<script setup lang="ts">
import { computed } from 'vue'
import { markA2hsPrompted, state } from './store'

const standalone = window.matchMedia('(display-mode: standalone)').matches || (navigator as any).standalone === true
const showA2hs = computed(() => state.ready && !standalone && !state.meta.a2hsPrompted)
</script>

<template>
  <div v-if="state.ready">
    <div v-if="showA2hs" class="a2hs">
      <span>请点浏览器的「分享」→「添加到主屏幕」，以便长期保存录音。</span>
      <button @click="markA2hsPrompted">知道了</button>
    </div>
    <router-view />
  </div>
</template>

<style scoped>
.a2hs { display: flex; gap: 8px; align-items: center; padding: 10px 14px; background: #fff7e0; font-size: 13px; }
.a2hs button { border: 0; background: #43B581; color: #fff; border-radius: 4px; padding: 4px 10px; flex: none; }
</style>
