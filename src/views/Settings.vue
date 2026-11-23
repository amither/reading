<script setup lang="ts">
import { reactive, ref } from 'vue'
import { reload, state, updateRoster, updateSettings } from '../store'
import { applyUpdate, appVersion, checkForUpdate } from '../services/pwa'
import { exportBackup, importBackup } from '../storage/backup'
import { clearRecords } from '../storage/repo'
import { TASK_IDS } from '../core/checkin'
import { toDateStr } from '../core/date'

const form = reactive(JSON.parse(JSON.stringify(state.settings)))
const msg = ref('')
const busy = ref(false)
const taskLabel = { chinese: '语文任务', english: '英语任务' } as const

async function save() {
  await updateSettings(JSON.parse(JSON.stringify(form)))
  msg.value = '已保存'
}

// ---- 同学名单 ----
async function pickRoster(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (!file) return
  try {
    const arr = JSON.parse(await file.text())
    if (!Array.isArray(arr) || !arr.every((x) => typeof x === 'string' && x.trim())) throw new Error()
    const names = [...new Set(arr.map((x: string) => x.trim()))]
    await updateRoster(names)
    msg.value = `已导入 ${names.length} 位同学`
  } catch {
    msg.value = '名单格式不对，应为字符串数组，如 ["张三","李四"]'
  }
  ;(e.target as HTMLInputElement).value = ''
}
async function clearRoster() {
  await updateRoster(null)
  msg.value = '已清除名单，改用内置姓名'
}

// ---- 备份 ----
async function doExport() {
  busy.value = true
  try {
    const bytes = await exportBackup()
    const file = new File([bytes as BlobPart], `阅读打卡备份-${toDateStr(new Date())}.zip`, { type: 'application/zip' })
    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file] })
    } else {
      const a = document.createElement('a')
      a.href = URL.createObjectURL(file)
      a.download = file.name
      a.click()
      setTimeout(() => URL.revokeObjectURL(a.href), 10000)
    }
    msg.value = '备份已导出'
  } catch (e: any) {
    if (e?.name !== 'AbortError') msg.value = '导出失败：' + (e?.message ?? e)
  } finally {
    busy.value = false
  }
}
async function doImport(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  try {
    const bytes = new Uint8Array(await file.arrayBuffer())
    const overwrite = window.confirm('点「确定」覆盖现有数据；点「取消」则选择合并。')
    const mode = overwrite ? 'overwrite' : 'merge'
    if (!overwrite && !window.confirm('合并：同一天保留较新的打卡，继续吗？')) return
    await importBackup(bytes, mode)
    await reload()
    Object.assign(form, JSON.parse(JSON.stringify(state.settings)))
    msg.value = mode === 'overwrite' ? '已覆盖导入' : '已合并导入'
  } catch (err: any) {
    msg.value = '导入失败：' + (err?.message ?? err)
  } finally {
    input.value = ''
  }
}
async function clearAll() {
  if (!window.confirm('清空所有打卡记录和录音？此操作不可恢复，建议先导出备份。')) return
  await clearRecords()
  await reload()
  msg.value = '已清空打卡记录'
}

// ---- 检查更新 ----
async function checkUpdate() {
  busy.value = true
  msg.value = '正在检查…'
  const r = await checkForUpdate()
  busy.value = false
  if (r === 'error') msg.value = '检查失败，请检查网络'
  else if (r === 'latest') msg.value = '已是最新版本'
  else if (window.confirm('发现新版本，立即更新？')) await applyUpdate()
  else msg.value = '发现新版本，下次可再更新'
}
</script>

<template>
  <div class="page">
    <div class="top"><router-link to="/" class="back" aria-label="返回">‹</router-link><span>设置</span></div>
    <p v-if="msg" class="msg">{{ msg }}</p>

    <section class="card">
      <h3>个人信息</h3>
      <label>姓名<input v-model="form.name" placeholder="孩子的姓名" /></label>
      <label>年级<input v-model="form.grade" placeholder="如：一年级" /></label>
      <label>班级<input v-model="form.className" placeholder="如：2班" /></label>
    </section>

    <section v-for="id in TASK_IDS" :key="id" class="card">
      <h3>{{ taskLabel[id] }}</h3>
      <label>标题<input v-model="form.tasks[id].title" /></label>
      <label>署名<input v-model="form.tasks[id].author" /></label>
      <label>说明<textarea v-model="form.tasks[id].desc" rows="4" /></label>
    </section>
    <div class="card"><button class="btn" @click="save">保存修改</button></div>

    <section class="card">
      <h3>同学名单</h3>
      <p class="muted">{{ state.roster ? `已导入 ${state.roster.length} 位同学` : '未导入，使用内置姓名' }}。选择本地 JSON 文件（字符串数组）。</p>
      <div class="actions">
        <label class="btn small file">导入名单<input type="file" accept="application/json,.json" @change="pickRoster" hidden /></label>
        <button v-if="state.roster" class="btn small danger" @click="clearRoster">清除名单</button>
      </div>
    </section>

    <section class="card">
      <h3>数据备份</h3>
      <p class="muted">包含打卡记录和全部录音，不含同学名单。</p>
      <div class="actions">
        <button class="btn small" :disabled="busy" @click="doExport">导出备份</button>
        <label class="btn small file">导入备份<input type="file" accept=".zip,application/zip" @change="doImport" hidden /></label>
        <button class="btn small danger" @click="clearAll">清空记录</button>
      </div>
    </section>

    <section class="card">
      <h3>应用</h3>
      <p class="muted">当前版本：{{ appVersion }}</p>
      <button class="btn" :disabled="busy" @click="checkUpdate">检查并更新</button>
    </section>
  </div>
</template>

<style scoped>
.msg { margin: 0 0 8px; padding: 10px 16px; background: #e8f6ee; color: #2a8a5c; }
.card { margin-bottom: 10px; }
h3 { margin: 0 0 10px; }
label { display: block; margin-bottom: 10px; font-size: 14px; color: #666; }
input, textarea { display: block; width: 100%; margin-top: 4px; padding: 10px; font: inherit; font-size: 16px; border: 1px solid #ddd; border-radius: 4px; }
.actions { display: flex; flex-wrap: wrap; gap: 10px; }
.file { display: inline-flex; align-items: center; margin: 0; color: #fff; }
</style>
