<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'

const props = defineProps<{ blob: Blob; durationSec: number }>()
const audio = ref<HTMLAudioElement>()
const url = ref('')
const playing = ref(false)
const current = ref(0)
const total = computed(() => props.durationSec)

watch(() => props.blob, (b) => {
  if (url.value) URL.revokeObjectURL(url.value)
  url.value = URL.createObjectURL(b)
  playing.value = false
  current.value = 0
}, { immediate: true })

onBeforeUnmount(() => url.value && URL.revokeObjectURL(url.value))

const fmt = (s: number) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`

function toggle() {
  const a = audio.value!
  if (a.paused) a.play(); else a.pause()
}
function seek(e: Event) {
  audio.value!.currentTime = Number((e.target as HTMLInputElement).value)
}
</script>

<template>
  <div class="player">
    <audio ref="audio" :src="url" preload="metadata"
      @play="playing = true" @pause="playing = false" @ended="playing = false; current = 0"
      @timeupdate="current = audio!.currentTime" />
    <button class="play" @click="toggle" :aria-label="playing ? '暂停' : '播放'">
      <svg v-if="!playing" viewBox="0 0 24 24" width="26" height="26" fill="#fff"><path d="M8 5v14l11-7z" /></svg>
      <svg v-else viewBox="0 0 24 24" width="26" height="26" fill="#fff"><path d="M7 5h4v14H7zM13 5h4v14h-4z" /></svg>
    </button>
    <span class="time">{{ fmt(current) }}</span>
    <input type="range" min="0" :max="total" step="0.1" :value="current" @input="seek" />
    <span class="time">{{ fmt(total) }}</span>
  </div>
</template>

<style scoped>
.player { display: flex; align-items: center; gap: 10px; padding: 12px; background: #fafafa; border: 1px solid #e5e5e5; }
.play { width: 46px; height: 46px; border-radius: 50%; border: 0; background: #8fd96b; display: flex; align-items: center; justify-content: center; flex: none; }
.time { color: #999; font-size: 14px; font-variant-numeric: tabular-nums; }
input[type='range'] { flex: 1; min-width: 0; accent-color: #8fd96b; }
</style>
