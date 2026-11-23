<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { markA2hsPrompted, state } from './store'

const route = useRoute()
const showTabs = computed(() => route.path === '/' || route.path === '/settings')
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
    <nav v-if="showTabs" class="tabs">
      <router-link to="/" replace>首页</router-link>
      <router-link to="/settings" replace>设置</router-link>
    </nav>
  </div>
</template>

<style scoped>
.a2hs { display: flex; gap: 8px; align-items: center; padding: 10px 14px; background: #fff7e0; font-size: 13px; }
.a2hs button { border: 0; background: #43B581; color: #fff; border-radius: 4px; padding: 4px 10px; flex: none; }
.tabs { position: fixed; bottom: 0; left: 0; right: 0; display: flex; background: #fff; border-top: 1px solid #eee; padding-bottom: env(safe-area-inset-bottom); }
.tabs a { flex: 1; text-align: center; padding: 14px 0; color: #888; text-decoration: none; }
.tabs a.router-link-exact-active { color: #43B581; font-weight: 600; }
</style>
