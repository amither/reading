<script setup lang="ts">
const props = withDefaults(defineProps<{ name: string; kind?: 'default' | 'color'; color?: string; size?: number }>(), { kind: 'color', color: '#8AB4F8', size: 44 })
</script>

<template>
  <div class="avatar" :style="{ width: props.size + 'px', height: props.size + 'px', background: props.kind === 'default' ? '#e3e3e3' : props.color, fontSize: props.size * 0.42 + 'px' }">
    <svg v-if="props.kind === 'default'" viewBox="0 0 24 24" :width="props.size * 0.7" :height="props.size * 0.7" fill="#b0b0b0">
      <circle cx="12" cy="8" r="4.2" /><path d="M3.5 22c0-5 3.8-8 8.5-8s8.5 3 8.5 8z" />
    </svg>
    <span v-else>{{ props.name.slice(0, 1) }}</span>
  </div>
</template>

<style scoped>
.avatar { border-radius: 50%; display: flex; align-items: center; justify-content: center; color: #fff; font-weight: 600; flex: none; overflow: hidden; }
</style>
