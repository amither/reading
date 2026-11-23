# 阅读打卡 PWA Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 做一个纯本地的语文、英语朗读打卡 PWA：每次打卡录音、按自然周统计、虚拟排行榜每天自动构造、设置里可检查并更新。

**Architecture:** Vite + Vue 3 SPA（hash 路由）。业务规则全部放在 `src/core/` 的纯函数里，用 Vitest 测试。数据存 IndexedDB（`idb`），录音用 MediaRecorder。vite-plugin-pwa 负责 Service Worker 与 manifest，部署到 GitHub Pages。

**Tech Stack:** Vue 3, TypeScript, Vite, vue-router, idb, fflate, vite-plugin-pwa, Vitest, fake-indexeddb, sharp（仅用于生成图标）

**Spec:** `docs/superpowers/specs/2026-11-23-reading-checkin-design.md`

---

## File Structure

```
package.json / tsconfig.json / vite.config.ts / index.html / .gitignore
assets/logo.svg                      Logo 源文件
scripts/gen-icons.mjs                由 logo.svg 导出各尺寸 PNG
public/                              生成的图标（pwa-192.png 等）
.github/workflows/deploy.yml
src/main.ts, App.vue, router.ts, store.ts, types.ts, env.d.ts, style.css
src/core/date.ts                     日期字符串工具
src/core/period.ts                   自然周
src/core/checkin.ts                  打卡/补卡/坚持天数规则
src/core/leaderboard.ts              虚拟排行榜
src/core/defaultNames.ts             内置 30 个随机姓名
src/storage/db.ts                    IndexedDB 打开与 schema
src/storage/repo.ts                  读写封装
src/storage/backup.ts                备份打包/解包/导入导出
src/services/recorder.ts             MediaRecorder 封装
src/services/pwa.ts                  SW 注册、检查更新、持久化
src/components/Avatar.vue, AudioPlayer.vue
src/views/Home.vue, TaskDetail.vue, Record.vue, CheckinRecord.vue, Leaderboard.vue, Settings.vue
tests/core/*.test.ts, tests/storage/*.test.ts
```

---

### Task 1: 项目脚手架

**Files:**
- Create: `package.json`, `tsconfig.json`, `vite.config.ts`, `index.html`, `.gitignore`, `src/env.d.ts`, `src/main.ts`, `src/App.vue`, `src/style.css`

- [ ] **Step 1: 初始化依赖**

```bash
cd /Users/arsir/other_code/reading
npm init -y
npm pkg set name=reading-checkin version=1.0.0 type=module private=true
npm pkg set scripts.dev="vite" scripts.build="vue-tsc --noEmit && vite build" scripts.preview="vite preview" scripts.test="vitest run" scripts.icons="node scripts/gen-icons.mjs"
npm i vue vue-router idb fflate
npm i -D vite @vitejs/plugin-vue typescript vue-tsc vite-plugin-pwa workbox-window vitest fake-indexeddb sharp
```

Expected: 无报错，生成 `package-lock.json`。

- [ ] **Step 2: 写配置文件**

`.gitignore`:
```
node_modules
dist
.DS_Store
names.json
*.local
```

`tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "jsx": "preserve",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "types": ["vite/client", "vite-plugin-pwa/client"],
    "skipLibCheck": true,
    "noEmit": true,
    "isolatedModules": true
  },
  "include": ["src/**/*.ts", "src/**/*.vue", "tests/**/*.ts", "vite.config.ts"]
}
```

`vite.config.ts`:
```ts
import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'
import { VitePWA } from 'vite-plugin-pwa'
import pkg from './package.json' with { type: 'json' }

const stamp = new Date().toISOString().slice(0, 16).replace('T', ' ')

export default defineConfig({
  base: process.env.VITE_BASE ?? '/',
  define: { __APP_VERSION__: JSON.stringify(`${pkg.version} (${stamp})`) },
  plugins: [
    vue(),
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['apple-touch-icon.png'],
      manifest: {
        name: '阅读打卡',
        short_name: '阅读打卡',
        lang: 'zh-CN',
        display: 'standalone',
        theme_color: '#43B581',
        background_color: '#ffffff',
        icons: [
          { src: 'pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: { globPatterns: ['**/*.{js,css,html,png,svg}'] },
    }),
  ],
  test: { include: ['tests/**/*.test.ts'], environment: 'node' },
})
```

`src/env.d.ts`:
```ts
/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />
declare const __APP_VERSION__: string
declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const c: DefineComponent<{}, {}, any>
  export default c
}
```

`index.html`:
```html
<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
    <meta name="theme-color" content="#43B581" />
    <meta name="apple-mobile-web-app-capable" content="yes" />
    <meta name="apple-mobile-web-app-title" content="阅读打卡" />
    <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
    <link rel="icon" href="/pwa-192.png" />
    <title>阅读打卡</title>
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
```

`src/style.css`:
```css
* { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
body { margin: 0; font-family: -apple-system, "PingFang SC", "Helvetica Neue", sans-serif; background: #f4f4f4; color: #222; }
button { font: inherit; }
.page { min-height: 100vh; padding-bottom: calc(120px + env(safe-area-inset-bottom)); }
.card { background: #fff; padding: 16px; }
.muted { color: #999; font-size: 13px; }
.badge { display: inline-block; padding: 2px 10px; border-radius: 12px; font-size: 13px; }
.badge.blue { background: #e3efff; color: #3a7bd5; }
.badge.green { background: #5fdcc0; color: #fff; }
.bottom-bar { position: fixed; left: 0; right: 0; bottom: 0; padding: 12px 16px calc(12px + env(safe-area-inset-bottom)); background: #fafafa; }
.btn { width: 100%; height: 48px; border: 0; border-radius: 4px; background: #3a7bd5; color: #fff; font-size: 18px; }
.btn:disabled { background: #a5c4e4; }
.btn.green { background: #43B581; }
.btn.small { width: auto; height: 36px; padding: 0 16px; font-size: 15px; }
.btn.danger { background: #e5534b; }
```

`src/App.vue`（先放占位，Task 10 替换）:
```vue
<template><router-view /></template>
```

`src/main.ts`（先放占位，Task 10 替换）:
```ts
import { createApp } from 'vue'
import App from './App.vue'
import './style.css'
createApp(App).mount('#app')
```

- [ ] **Step 3: 验证构建**

Run: `npx vue-tsc --noEmit && npx vite build 2>&1 | tail -5`
Expected: 类型检查通过（router-view 未注册只是运行时警告）；vite build 成功。图标文件还不存在时 PWA 插件可能警告缺图标，可忽略，Task 9 会生成。

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "chore: scaffold Vite + Vue + PWA project

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 2: 日期与自然周（core/date, core/period）

**Files:**
- Create: `src/core/date.ts`, `src/core/period.ts`
- Test: `tests/core/period.test.ts`

- [ ] **Step 1: 写失败的测试**

`tests/core/period.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { toDateStr, addDays } from '../../src/core/date'
import { periodOf, elapsedDays } from '../../src/core/period'

describe('date', () => {
  it('formats local date as YYYY-MM-DD', () => {
    expect(toDateStr(new Date(2026, 10, 3, 23, 59))).toBe('2026-11-03')
  })
  it('adds days across month boundary', () => {
    expect(addDays('2026-11-30', 1)).toBe('2026-12-01')
    expect(addDays('2026-11-01', -1)).toBe('2026-10-31')
  })
})

describe('period', () => {
  it('Sunday belongs to the week that started on Monday', () => {
    const p = periodOf('2026-11-22')
    expect(p[0]).toBe('2026-11-16')
    expect(p[6]).toBe('2026-11-22')
    expect(p).toHaveLength(7)
  })
  it('Monday starts a new period', () => {
    expect(periodOf('2026-11-23')[0]).toBe('2026-11-23')
  })
  it('mid-week date', () => {
    expect(periodOf('2026-11-12')[0]).toBe('2026-11-09')
  })
  it('elapsedDays is 1 on Monday and 7 on Sunday', () => {
    expect(elapsedDays('2026-11-23')).toBe(1)
    expect(elapsedDays('2026-11-22')).toBe(7)
    expect(elapsedDays('2026-11-25')).toBe(3)
  })
})
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run tests/core/period.test.ts`
Expected: FAIL，找不到 `../../src/core/date`。

- [ ] **Step 3: 实现**

`src/core/date.ts`:
```ts
const pad = (n: number) => String(n).padStart(2, '0')

export function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** 以本地中午解析，避免夏令时/时区边界问题 */
export function parseDateStr(s: string): Date {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d, 12)
}

export function addDays(s: string, n: number): string {
  const d = parseDateStr(s)
  d.setDate(d.getDate() + n)
  return toDateStr(d)
}

/** "2026-11-09" -> "11-09" */
export function shortDate(s: string): string {
  return s.slice(5)
}
```

`src/core/period.ts`:
```ts
import { addDays, parseDateStr } from './date'

/** 返回包含 date 的自然周（周一到周日）的 7 个日期 */
export function periodOf(date: string): string[] {
  const offset = (parseDateStr(date).getDay() + 6) % 7 // 周一=0
  const monday = addDays(date, -offset)
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i))
}

/** 本周已过去的天数（含今天）：周一=1 … 周日=7 */
export function elapsedDays(today: string): number {
  return ((parseDateStr(today).getDay() + 6) % 7) + 1
}
```

- [ ] **Step 4: 运行确认通过**

Run: `npx vitest run tests/core/period.test.ts`
Expected: PASS（6 个用例）。

- [ ] **Step 5: Commit**

```bash
git add src/core/date.ts src/core/period.ts tests/core/period.test.ts
git commit -m "feat(core): date helpers and natural-week period

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 3: 打卡与补卡规则（core/checkin）

**Files:**
- Create: `src/types.ts`, `src/core/checkin.ts`
- Test: `tests/core/checkin.test.ts`

- [ ] **Step 1: 写类型**

`src/types.ts`:
```ts
export type TaskId = 'chinese' | 'english'

export interface Checkin {
  taskId: TaskId
  date: string // YYYY-MM-DD，本地时区
  submittedAt: number // 真实提交时间戳
  isMakeup: boolean
  durationSec: number
  audioId: string
}

export interface AudioRecord {
  id: string
  data: ArrayBuffer
  mimeType: string
  durationSec: number
}

export interface TaskText {
  title: string
  author: string
  desc: string
}

export interface Settings {
  name: string
  grade: string
  className: string
  tasks: Record<TaskId, TaskText>
}

export interface Meta {
  a2hsPrompted: boolean
}
```

- [ ] **Step 2: 写失败的测试**

`tests/core/checkin.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { streakDays, makeupUsed, dayStatus, canCheckin, MAKEUP_LIMIT } from '../../src/core/checkin'
import type { Checkin } from '../../src/types'

const mk = (date: string, isMakeup = false, taskId: 'chinese' | 'english' = 'chinese'): Checkin => ({
  taskId, date, submittedAt: 1, isMakeup, durationSec: 10, audioId: date,
})
const TODAY = '2026-11-12' // 周四，本周 11-09 ~ 11-15

describe('streakDays', () => {
  it('counts only this period and this task', () => {
    const all = [mk('2026-11-09'), mk('2026-11-10', true), mk('2026-11-08'), mk('2026-11-11', false, 'english')]
    expect(streakDays(all, 'chinese', TODAY)).toBe(2)
  })
})

describe('makeupUsed', () => {
  it('counts makeup records of this period/task', () => {
    const all = [mk('2026-11-09', true), mk('2026-11-10', true), mk('2026-11-02', true), mk('2026-11-11', true, 'english')]
    expect(makeupUsed(all, 'chinese', TODAY)).toBe(2)
  })
})

describe('dayStatus', () => {
  const all = [mk('2026-11-09')]
  it('classifies days', () => {
    expect(dayStatus(all, 'chinese', '2026-11-09', TODAY)).toBe('done')
    expect(dayStatus(all, 'chinese', '2026-11-10', TODAY)).toBe('missed')
    expect(dayStatus(all, 'chinese', '2026-11-12', TODAY)).toBe('today')
    expect(dayStatus(all, 'chinese', '2026-11-13', TODAY)).toBe('future')
  })
})

describe('canCheckin', () => {
  it('allows today as normal checkin', () => {
    expect(canCheckin([], 'chinese', TODAY, TODAY)).toEqual({ ok: true, isMakeup: false })
  })
  it('rejects duplicates', () => {
    const r = canCheckin([mk(TODAY)], 'chinese', TODAY, TODAY)
    expect(r.ok).toBe(false)
  })
  it('rejects future dates', () => {
    expect(canCheckin([], 'chinese', '2026-11-13', TODAY).ok).toBe(false)
  })
  it('rejects previous week', () => {
    expect(canCheckin([], 'chinese', '2026-11-08', TODAY).ok).toBe(false)
  })
  it('allows makeup for missed day in this week', () => {
    expect(canCheckin([], 'chinese', '2026-11-10', TODAY)).toEqual({ ok: true, isMakeup: true })
  })
  it('rejects makeup when quota used up', () => {
    const all = [mk('2026-11-09', true), mk('2026-11-10', true), mk('2026-11-11', true)]
    const r = canCheckin(all, 'chinese', '2026-11-12', '2026-11-13')
    expect(MAKEUP_LIMIT).toBe(3)
    expect(r).toEqual({ ok: false, reason: '本周补卡次数已用完' })
  })
  it('quota is per task', () => {
    const all = [mk('2026-11-09', true), mk('2026-11-10', true), mk('2026-11-11', true)]
    expect(canCheckin(all, 'english', '2026-11-09', TODAY).ok).toBe(true)
  })
})
```

- [ ] **Step 3: 运行确认失败**

Run: `npx vitest run tests/core/checkin.test.ts`
Expected: FAIL，找不到 `core/checkin`。

- [ ] **Step 4: 实现**

`src/core/checkin.ts`:
```ts
import type { Checkin, TaskId } from '../types'
import { periodOf } from './period'

export const TASK_IDS: TaskId[] = ['chinese', 'english']
export const MAKEUP_LIMIT = 3

export type DayStatus = 'done' | 'missed' | 'today' | 'future'
export type CanCheckin = { ok: true; isMakeup: boolean } | { ok: false; reason: string }

export function periodCheckins(all: Checkin[], taskId: TaskId, today: string): Checkin[] {
  const days = new Set(periodOf(today))
  return all.filter((c) => c.taskId === taskId && days.has(c.date))
}

export function streakDays(all: Checkin[], taskId: TaskId, today: string): number {
  return periodCheckins(all, taskId, today).length
}

export function makeupUsed(all: Checkin[], taskId: TaskId, today: string): number {
  return periodCheckins(all, taskId, today).filter((c) => c.isMakeup).length
}

export function dayStatus(all: Checkin[], taskId: TaskId, date: string, today: string): DayStatus {
  if (all.some((c) => c.taskId === taskId && c.date === date)) return 'done'
  if (date > today) return 'future'
  if (date === today) return 'today'
  return 'missed'
}

export function canCheckin(all: Checkin[], taskId: TaskId, date: string, today: string): CanCheckin {
  if (!periodOf(today).includes(date)) return { ok: false, reason: '只能补本周的打卡' }
  const status = dayStatus(all, taskId, date, today)
  if (status === 'done') return { ok: false, reason: '已打卡' }
  if (status === 'future') return { ok: false, reason: '还没到打卡日期' }
  if (status === 'today') return { ok: true, isMakeup: false }
  if (makeupUsed(all, taskId, today) >= MAKEUP_LIMIT) return { ok: false, reason: '本周补卡次数已用完' }
  return { ok: true, isMakeup: true }
}
```

- [ ] **Step 5: 运行确认通过**

Run: `npx vitest run tests/core/checkin.test.ts`
Expected: PASS（全部用例）。

- [ ] **Step 6: Commit**

```bash
git add src/types.ts src/core/checkin.ts tests/core/checkin.test.ts
git commit -m "feat(core): check-in, makeup quota and streak rules

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 4: 虚拟排行榜（core/leaderboard）

**Files:**
- Create: `src/core/defaultNames.ts`, `src/core/leaderboard.ts`
- Test: `tests/core/leaderboard.test.ts`

- [ ] **Step 1: 内置姓名**（均为虚构，不含真实同学姓名）

`src/core/defaultNames.ts`:
```ts
export const DEFAULT_NAMES: string[] = [
  '林若溪', '周启航', '孟子墨', '何雨桐', '宋嘉禾', '韩亦辰', '杜思远', '范书瑶', '白景行', '龚梓萱',
  '康浩然', '邵明哲', '秦可心', '尹乐瑶', '萧云舒', '钟一诺', '傅星河', '雷子睿', '洪安然', '蒋佳艺',
  '施文博', '姚清和', '卢晨曦', '任思齐', '毛晓宇', '汪语桐', '邱泽楷', '覃雅宁', '易知远', '戴沐阳',
]
```

- [ ] **Step 2: 写失败的测试**

`tests/core/leaderboard.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { buildLeaderboard, mulberry32, hashString } from '../../src/core/leaderboard'
import { DEFAULT_NAMES } from '../../src/core/defaultNames'
import { elapsedDays } from '../../src/core/period'

const base = { names: DEFAULT_NAMES, taskId: 'chinese' as const, me: { name: '小明', days: 2 } }

describe('rng', () => {
  it('mulberry32 is deterministic and in [0,1)', () => {
    const a = mulberry32(42), b = mulberry32(42)
    for (let i = 0; i < 20; i++) { const v = a(); expect(v).toBe(b()); expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThan(1) }
  })
  it('hashString is stable', () => {
    expect(hashString('abc')).toBe(hashString('abc'))
    expect(hashString('abc')).not.toBe(hashString('abd'))
  })
})

describe('buildLeaderboard', () => {
  it('is deterministic for same day/hour', () => {
    const a = buildLeaderboard({ ...base, today: '2026-11-25', hour: 20 })
    const b = buildLeaderboard({ ...base, today: '2026-11-25', hour: 20 })
    expect(a).toEqual(b)
  })
  it('includes everyone plus me', () => {
    const r = buildLeaderboard({ ...base, today: '2026-11-25', hour: 20 })
    expect(r).toHaveLength(DEFAULT_NAMES.length + 1)
    expect(r.filter((e) => e.isMe)).toHaveLength(1)
  })
  it('excludes roster entry with same name as me', () => {
    const r = buildLeaderboard({ ...base, names: ['小明', '小红'], today: '2026-11-25', hour: 20 })
    expect(r).toHaveLength(2)
  })
  it('virtual days never exceed elapsed days', () => {
    for (const today of ['2026-11-23', '2026-11-24', '2026-11-26', '2026-11-29']) {
      const n = elapsedDays(today)
      for (const e of buildLeaderboard({ ...base, today, hour: 23 }).filter((x) => !x.isMe)) {
        expect(e.days).toBeLessThanOrEqual(n)
        expect(e.days).toBeGreaterThanOrEqual(0)
      }
    }
  })
  it('uses dense ranking sorted by days desc', () => {
    const r = buildLeaderboard({ ...base, today: '2026-11-27', hour: 20 })
    for (let i = 1; i < r.length; i++) {
      expect(r[i].days).toBeLessThanOrEqual(r[i - 1].days)
      const step = r[i].rank - r[i - 1].rank
      expect(step).toBe(r[i].days === r[i - 1].days ? 0 : 1)
    }
    expect(r[0].rank).toBe(1)
  })
  it('earlier hour never gives more days than later hour', () => {
    const early = buildLeaderboard({ ...base, today: '2026-11-26', hour: 6 })
    const late = buildLeaderboard({ ...base, today: '2026-11-26', hour: 23 })
    const sum = (r: typeof early) => r.filter((e) => !e.isMe).reduce((s, e) => s + e.days, 0)
    expect(sum(early)).toBeLessThanOrEqual(sum(late))
  })
  it('task boards differ', () => {
    const a = buildLeaderboard({ ...base, today: '2026-11-26', hour: 20 })
    const b = buildLeaderboard({ ...base, taskId: 'english', today: '2026-11-26', hour: 20 })
    expect(a.map((e) => e.name + e.days)).not.toEqual(b.map((e) => e.name + e.days))
  })
  it('avatar is stable per name across days', () => {
    const a = buildLeaderboard({ ...base, today: '2026-11-24', hour: 20 })
    const b = buildLeaderboard({ ...base, today: '2026-11-25', hour: 20 })
    const pick = (r: typeof a) => Object.fromEntries(r.map((e) => [e.name, e.avatarKind + e.color]))
    expect(pick(a)).toEqual(pick(b))
  })
})
```

- [ ] **Step 3: 运行确认失败**

Run: `npx vitest run tests/core/leaderboard.test.ts`
Expected: FAIL，找不到 `core/leaderboard`。

- [ ] **Step 4: 实现**

`src/core/leaderboard.ts`:
```ts
import type { TaskId } from '../types'
import { elapsedDays } from './period'

export interface BoardEntry {
  name: string
  days: number
  rank: number
  isMe: boolean
  avatarKind: 'default' | 'color'
  color: string
}

export interface BoardInput {
  names: string[]
  taskId: TaskId
  today: string
  hour: number // 本地小时 0-23，用于“当天实时感”
  me: { name: string; days: number }
}

const COLORS = ['#F28B82', '#FBBC04', '#81C995', '#78D9EC', '#8AB4F8', '#C58AF9', '#FF8BCB', '#F6AEA9', '#A7D8A0', '#FFB870']

export function hashString(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function avatarOf(name: string): Pick<BoardEntry, 'avatarKind' | 'color'> {
  const h = hashString('avatar|' + name)
  return { avatarKind: h % 100 < 40 ? 'default' : 'color', color: COLORS[(h >>> 8) % COLORS.length] }
}

function virtualDays(name: string, taskId: TaskId, today: string, hour: number): number {
  const n = elapsedDays(today)
  const rng = mulberry32(hashString(`${today}|${taskId}|${name}`))
  const low = Math.max(0, n - 2)
  let days = low + Math.round((n - low) * Math.sqrt(rng())) // sqrt 使分布偏向高值
  const finishHour = 6 + Math.floor(rng() * 16) // 今天打卡完成的时刻 6~21 点
  if (days > 0 && finishHour > hour) days -= 1 // 还没到点，今天这一卡暂不计入
  return days
}

export function buildLeaderboard(input: BoardInput): BoardEntry[] {
  const { names, taskId, today, hour, me } = input
  const tie = (name: string) => hashString(`${today}|${taskId}|tie|${name}`)
  const raw = [
    ...names.filter((n) => n !== me.name).map((name) => ({ name, days: virtualDays(name, taskId, today, hour), isMe: false })),
    { name: me.name, days: me.days, isMe: true },
  ]
  raw.sort((a, b) => b.days - a.days || tie(a.name) - tie(b.name))
  let rank = 0
  let prev = -1
  return raw.map((e) => {
    if (e.days !== prev) { rank += 1; prev = e.days }
    return { ...e, rank, ...avatarOf(e.name) }
  })
}
```

- [ ] **Step 5: 运行确认通过**

Run: `npx vitest run tests/core`
Expected: PASS（core 下全部测试）。

- [ ] **Step 6: Commit**

```bash
git add src/core/defaultNames.ts src/core/leaderboard.ts tests/core/leaderboard.test.ts
git commit -m "feat(core): deterministic virtual leaderboard with dense ranking

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 5: 存储层（IndexedDB）

**Files:**
- Create: `src/storage/db.ts`, `src/storage/repo.ts`
- Test: `tests/storage/repo.test.ts`

- [ ] **Step 1: 写失败的测试**

`tests/storage/repo.test.ts`:
```ts
import 'fake-indexeddb/auto'
import { describe, it, expect, beforeEach } from 'vitest'
import { loadSettings, saveSettings, listCheckins, saveCheckin, getAudio, clearRecords, loadRoster, saveRoster, defaultSettings } from '../../src/storage/repo'
import type { Checkin, AudioRecord } from '../../src/types'

const checkin = (date: string): Checkin => ({ taskId: 'chinese', date, submittedAt: 5, isMakeup: false, durationSec: 12, audioId: 'a-' + date })
const audio = (date: string): AudioRecord => ({ id: 'a-' + date, data: new Uint8Array([1, 2, 3]).buffer, mimeType: 'audio/mp4', durationSec: 12 })

beforeEach(async () => { await clearRecords() })

describe('repo', () => {
  it('returns default settings when empty and persists edits', async () => {
    expect((await loadSettings()).tasks.chinese.title).toBe(defaultSettings().tasks.chinese.title)
    const s = defaultSettings(); s.name = '小明'; s.grade = '一年级'; s.className = '2班'
    await saveSettings(s)
    expect((await loadSettings()).name).toBe('小明')
  })
  it('saves check-in with audio and reads them back', async () => {
    await saveCheckin(checkin('2026-11-09'), audio('2026-11-09'))
    expect(await listCheckins()).toHaveLength(1)
    const a = await getAudio('a-2026-11-09')
    expect(a?.mimeType).toBe('audio/mp4')
    expect(new Uint8Array(a!.data)).toEqual(new Uint8Array([1, 2, 3]))
  })
  it('clearRecords removes check-ins and audios', async () => {
    await saveCheckin(checkin('2026-11-09'), audio('2026-11-09'))
    await clearRecords()
    expect(await listCheckins()).toHaveLength(0)
    expect(await getAudio('a-2026-11-09')).toBeUndefined()
  })
  it('roster roundtrip and clear', async () => {
    expect(await loadRoster()).toBeNull()
    await saveRoster(['甲', '乙'])
    expect(await loadRoster()).toEqual(['甲', '乙'])
    await saveRoster(null)
    expect(await loadRoster()).toBeNull()
  })
})
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run tests/storage/repo.test.ts`
Expected: FAIL，找不到 `storage/repo`。

- [ ] **Step 3: 实现**

`src/storage/db.ts`:
```ts
import { openDB, type DBSchema, type IDBPDatabase } from 'idb'
import type { AudioRecord, Checkin } from '../types'

interface ReadingDB extends DBSchema {
  checkins: { key: [string, string]; value: Checkin }
  audios: { key: string; value: AudioRecord }
  kv: { key: string; value: unknown }
}

let dbPromise: Promise<IDBPDatabase<ReadingDB>> | null = null

export function getDb() {
  dbPromise ??= openDB<ReadingDB>('reading-checkin', 1, {
    upgrade(db) {
      db.createObjectStore('checkins', { keyPath: ['taskId', 'date'] })
      db.createObjectStore('audios', { keyPath: 'id' })
      db.createObjectStore('kv')
    },
  })
  return dbPromise
}
```

`src/storage/repo.ts`:
```ts
import type { AudioRecord, Checkin, Meta, Settings } from '../types'
import { getDb } from './db'

export function defaultSettings(): Settings {
  return {
    name: '',
    grade: '',
    className: '',
    tasks: {
      chinese: {
        title: '大声读语文',
        author: '老师',
        desc: '坚持大声朗读课文和古诗，可以练习发音与断句，对语感的培养很有帮助。遇到不会读的字不用担心，可以查字典看拼音，也可以多听多模仿。自信地读出来吧！',
      },
      english: {
        title: '大声读英语',
        author: '老师',
        desc: '坚持大声朗读英语绘本可以练习发音，对语感的培养也很有帮助。遇到不会读的单词不用担心，可翻看课本或字典查看音标，也可以平时多听多模仿。自信读英语的孩子进步最快！',
      },
    },
  }
}

export async function loadSettings(): Promise<Settings> {
  const db = await getDb()
  const saved = (await db.get('kv', 'settings')) as Settings | undefined
  const d = defaultSettings()
  return saved ? { ...d, ...saved, tasks: { ...d.tasks, ...saved.tasks } } : d
}

export async function saveSettings(s: Settings) {
  await (await getDb()).put('kv', JSON.parse(JSON.stringify(s)), 'settings')
}

export async function loadRoster(): Promise<string[] | null> {
  return (((await (await getDb()).get('kv', 'roster')) as string[] | undefined) ?? null)
}

export async function saveRoster(names: string[] | null) {
  const db = await getDb()
  if (names) await db.put('kv', names, 'roster')
  else await db.delete('kv', 'roster')
}

export async function loadMeta(): Promise<Meta> {
  return ((await (await getDb()).get('kv', 'meta')) as Meta | undefined) ?? { a2hsPrompted: false }
}

export async function saveMeta(m: Meta) {
  await (await getDb()).put('kv', m, 'meta')
}

export async function listCheckins(): Promise<Checkin[]> {
  return (await getDb()).getAll('checkins')
}

/** 同一事务写入打卡记录与录音，保证不会只写一半 */
export async function saveCheckin(c: Checkin, a: AudioRecord) {
  const db = await getDb()
  const tx = db.transaction(['checkins', 'audios'], 'readwrite')
  await Promise.all([tx.objectStore('checkins').put(c), tx.objectStore('audios').put(a), tx.done])
}

export async function getAudio(id: string): Promise<AudioRecord | undefined> {
  return (await getDb()).get('audios', id)
}

/** 清空打卡记录与录音（保留设置和同学名单） */
export async function clearRecords() {
  const db = await getDb()
  const tx = db.transaction(['checkins', 'audios'], 'readwrite')
  await Promise.all([tx.objectStore('checkins').clear(), tx.objectStore('audios').clear(), tx.done])
}
```

- [ ] **Step 4: 运行确认通过**

Run: `npx vitest run tests/storage/repo.test.ts`
Expected: PASS（4 个用例）。

- [ ] **Step 5: Commit**

```bash
git add src/storage tests/storage/repo.test.ts
git commit -m "feat(storage): IndexedDB repo for settings, check-ins, audios, roster

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 6: 备份与恢复（storage/backup）

**Files:**
- Create: `src/storage/backup.ts`
- Test: `tests/storage/backup.test.ts`

- [ ] **Step 1: 写失败的测试**

`tests/storage/backup.test.ts`:
```ts
import 'fake-indexeddb/auto'
import { describe, it, expect, beforeEach } from 'vitest'
import { packBackup, unpackBackup, mergeCheckins, exportBackup, importBackup } from '../../src/storage/backup'
import { saveCheckin, listCheckins, getAudio, clearRecords, saveSettings, loadSettings, defaultSettings } from '../../src/storage/repo'
import type { Checkin, AudioRecord } from '../../src/types'

const c = (date: string, submittedAt = 1, audioId = 'a-' + date): Checkin => ({ taskId: 'chinese', date, submittedAt, isMakeup: false, durationSec: 5, audioId })
const a = (id: string, byte = 7): AudioRecord => ({ id, data: new Uint8Array([byte, byte]).buffer, mimeType: 'audio/mp4', durationSec: 5 })

beforeEach(async () => { await clearRecords() })

describe('pack/unpack', () => {
  it('roundtrips checkins, settings and audio bytes', () => {
    const s = defaultSettings(); s.name = '小明'
    const bytes = packBackup({ checkins: [c('2026-11-09')], settings: s, audios: [a('a-2026-11-09')] })
    const out = unpackBackup(bytes)
    expect(out.checkins).toHaveLength(1)
    expect(out.settings.name).toBe('小明')
    expect(new Uint8Array(out.audios[0].data)).toEqual(new Uint8Array([7, 7]))
    expect(out.audios[0].mimeType).toBe('audio/mp4')
  })
  it('rejects non-backup data', () => {
    expect(() => unpackBackup(new Uint8Array([1, 2, 3]))).toThrow()
  })
})

describe('mergeCheckins', () => {
  it('keeps newer submission per task+date', () => {
    const merged = mergeCheckins([c('2026-11-09', 10)], [c('2026-11-09', 20), c('2026-11-10', 1)])
    expect(merged.find((x) => x.date === '2026-11-09')!.submittedAt).toBe(20)
    expect(merged).toHaveLength(2)
  })
})

describe('export/import', () => {
  it('overwrite replaces current data', async () => {
    await saveCheckin(c('2026-11-09'), a('a-2026-11-09'))
    const bytes = await exportBackup()
    await clearRecords()
    await saveCheckin(c('2026-11-10'), a('a-2026-11-10'))
    await importBackup(bytes, 'overwrite')
    const list = await listCheckins()
    expect(list.map((x) => x.date)).toEqual(['2026-11-09'])
    expect(await getAudio('a-2026-11-10')).toBeUndefined()
    expect(await getAudio('a-2026-11-09')).toBeDefined()
  })
  it('merge keeps both and prefers newer on conflict', async () => {
    await saveCheckin(c('2026-11-09', 10, 'old'), a('old', 1))
    const bytes = packBackup({ checkins: [c('2026-11-09', 20, 'new'), c('2026-11-10', 5)], settings: defaultSettings(), audios: [a('new', 2), a('a-2026-11-10', 3)] })
    await importBackup(bytes, 'merge')
    const list = await listCheckins()
    expect(list).toHaveLength(2)
    expect(list.find((x) => x.date === '2026-11-09')!.audioId).toBe('new')
    expect(await getAudio('old')).toBeUndefined()
  })
  it('merge keeps existing settings, overwrite replaces them', async () => {
    const mine = defaultSettings(); mine.name = '现有'
    await saveSettings(mine)
    const other = defaultSettings(); other.name = '备份'
    const bytes = packBackup({ checkins: [], settings: other, audios: [] })
    await importBackup(bytes, 'merge')
    expect((await loadSettings()).name).toBe('现有')
    await importBackup(bytes, 'overwrite')
    expect((await loadSettings()).name).toBe('备份')
  })
})
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run tests/storage/backup.test.ts`
Expected: FAIL，找不到 `storage/backup`。

- [ ] **Step 3: 实现**

`src/storage/backup.ts`:
```ts
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate'
import type { AudioRecord, Checkin, Settings } from '../types'
import { getDb } from './db'
import { listCheckins, loadSettings, saveSettings } from './repo'

const VERSION = 1

export interface BackupPayload {
  checkins: Checkin[]
  settings: Settings
  audios: AudioRecord[]
}

export function packBackup(p: BackupPayload): Uint8Array {
  const files: Record<string, Uint8Array> = {}
  const audioMeta = p.audios.map((a) => {
    files[`audios/${a.id}.bin`] = new Uint8Array(a.data)
    return { id: a.id, mimeType: a.mimeType, durationSec: a.durationSec }
  })
  files['data.json'] = strToU8(JSON.stringify({ version: VERSION, checkins: p.checkins, settings: p.settings, audios: audioMeta }))
  return zipSync(files, { level: 0 }) // 音频已压缩，不再压缩
}

export function unpackBackup(bytes: Uint8Array): BackupPayload {
  let files: Record<string, Uint8Array>
  try {
    files = unzipSync(bytes)
  } catch {
    throw new Error('不是有效的备份文件')
  }
  if (!files['data.json']) throw new Error('备份文件缺少 data.json')
  const data = JSON.parse(strFromU8(files['data.json']))
  if (data.version !== VERSION) throw new Error(`不支持的备份版本：${data.version}`)
  const audios: AudioRecord[] = (data.audios as Omit<AudioRecord, 'data'>[]).map((m) => {
    const raw = files[`audios/${m.id}.bin`]
    if (!raw) throw new Error(`备份缺少录音：${m.id}`)
    return { ...m, data: raw.slice().buffer as ArrayBuffer }
  })
  return { checkins: data.checkins, settings: data.settings, audios }
}

/** 同任务同日期保留提交时间较新的一条 */
export function mergeCheckins(existing: Checkin[], incoming: Checkin[]): Checkin[] {
  const map = new Map<string, Checkin>()
  for (const c of [...existing, ...incoming]) {
    const key = `${c.taskId}|${c.date}`
    const prev = map.get(key)
    if (!prev || c.submittedAt > prev.submittedAt) map.set(key, c)
  }
  return [...map.values()]
}

export async function exportBackup(): Promise<Uint8Array> {
  const db = await getDb()
  return packBackup({ checkins: await listCheckins(), settings: await loadSettings(), audios: await db.getAll('audios') })
}

export async function importBackup(bytes: Uint8Array, mode: 'overwrite' | 'merge') {
  const incoming = unpackBackup(bytes)
  const db = await getDb()
  const existing = mode === 'merge' ? await listCheckins() : []
  const merged = mergeCheckins(existing, incoming.checkins)
  const keepAudioIds = new Set(merged.map((c) => c.audioId))
  const incomingAudio = new Map(incoming.audios.map((x) => [x.id, x]))

  const tx = db.transaction(['checkins', 'audios'], 'readwrite')
  const cs = tx.objectStore('checkins')
  const as = tx.objectStore('audios')
  if (mode === 'overwrite') {
    await Promise.all([cs.clear(), as.clear()])
  } else {
    for (const old of await as.getAllKeys()) if (!keepAudioIds.has(old)) await as.delete(old)
  }
  for (const c of merged) {
    await cs.put(c)
    const audio = incomingAudio.get(c.audioId)
    if (audio) await as.put(audio)
  }
  await tx.done
  if (mode === 'overwrite') await saveSettings(incoming.settings)
}
```

- [ ] **Step 4: 运行确认通过**

Run: `npx vitest run`
Expected: 全部测试 PASS。

- [ ] **Step 5: Commit**

```bash
git add src/storage/backup.ts tests/storage/backup.test.ts
git commit -m "feat(storage): zip backup export/import with overwrite and merge

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 7: 录音与 PWA 服务（services/）

这两个模块依赖浏览器 API（MediaRecorder、Service Worker），不做单元测试，Task 13 在真机验证。

**Files:**
- Create: `src/services/recorder.ts`, `src/services/pwa.ts`

- [ ] **Step 1: 录音封装**

`src/services/recorder.ts`:
```ts
export const MIN_SECONDS = 3
export const MAX_SECONDS = 30 * 60

const MIME_CANDIDATES = ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm']

export function pickMimeType(): string {
  if (typeof MediaRecorder === 'undefined') return ''
  return MIME_CANDIDATES.find((m) => MediaRecorder.isTypeSupported(m)) ?? ''
}

export interface RecordingResult {
  blob: Blob
  mimeType: string
  durationSec: number
}

export class Recorder {
  private stream: MediaStream | null = null
  private rec: MediaRecorder | null = null
  private chunks: Blob[] = []
  private accumulatedMs = 0
  private segmentStart = 0
  private wakeLock: { release(): Promise<void> } | null = null
  private timer: number | null = null
  /** 已录时长（秒），含暂停前的累计 */
  elapsedSec = 0
  onTick: (sec: number) => void = () => {}
  onAutoStop: () => void = () => {}

  async start() {
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    const mime = pickMimeType()
    this.rec = new MediaRecorder(this.stream, mime ? { mimeType: mime } : undefined)
    this.chunks = []
    this.accumulatedMs = 0
    this.rec.ondataavailable = (e) => e.data.size && this.chunks.push(e.data)
    this.rec.start(1000)
    this.segmentStart = Date.now()
    this.startTick()
    try {
      this.wakeLock = await (navigator as any).wakeLock?.request('screen')
    } catch { /* 不支持或被拒绝，忽略 */ }
  }

  pause() {
    this.rec?.pause()
    this.accumulatedMs += Date.now() - this.segmentStart
    this.stopTick()
  }

  resume() {
    this.rec?.resume()
    this.segmentStart = Date.now()
    this.startTick()
  }

  stop(): Promise<RecordingResult> {
    const rec = this.rec!
    const paused = rec.state === 'paused'
    if (!paused) this.accumulatedMs += Date.now() - this.segmentStart
    this.stopTick()
    return new Promise((resolve) => {
      rec.onstop = () => {
        const mimeType = rec.mimeType || pickMimeType() || 'audio/mp4'
        resolve({ blob: new Blob(this.chunks, { type: mimeType }), mimeType, durationSec: Math.round(this.accumulatedMs / 1000) })
        this.release()
      }
      rec.stop()
    })
  }

  /** 放弃录音并释放麦克风 */
  cancel() {
    this.stopTick()
    if (this.rec && this.rec.state !== 'inactive') {
      this.rec.onstop = null
      this.rec.stop()
    }
    this.release()
  }

  private release() {
    this.stream?.getTracks().forEach((t) => t.stop())
    this.stream = null
    this.wakeLock?.release().catch(() => {})
    this.wakeLock = null
  }

  private startTick() {
    this.timer = window.setInterval(() => {
      this.elapsedSec = Math.floor((this.accumulatedMs + Date.now() - this.segmentStart) / 1000)
      this.onTick(this.elapsedSec)
      if (this.elapsedSec >= MAX_SECONDS) this.onAutoStop()
    }, 250)
  }

  private stopTick() {
    if (this.timer !== null) clearInterval(this.timer)
    this.timer = null
  }
}
```

- [ ] **Step 2: PWA 服务**

`src/services/pwa.ts`:
```ts
import { registerSW } from 'virtual:pwa-register'

export type UpdateResult = 'available' | 'latest' | 'error'

let registration: ServiceWorkerRegistration | undefined
let needRefresh = false
let updateSW: ((reload?: boolean) => Promise<void>) | undefined

export function initPwa() {
  updateSW = registerSW({
    onNeedRefresh() { needRefresh = true },
    onRegisteredSW(_url, reg) { registration = reg },
  })
  // 申请持久化存储，降低 iOS 清理网站数据的风险
  navigator.storage?.persist?.().catch(() => {})
}

function waitInstalled(worker: ServiceWorker, timeoutMs = 20000): Promise<void> {
  return new Promise((resolve) => {
    const done = () => resolve()
    const timer = setTimeout(done, timeoutMs)
    worker.addEventListener('statechange', () => {
      if (worker.state === 'installed' || worker.state === 'redundant') { clearTimeout(timer); done() }
    })
    if (worker.state === 'installed') { clearTimeout(timer); done() }
  })
}

/** 点击「检查并更新」：查新版本，不自动应用 */
export async function checkForUpdate(): Promise<UpdateResult> {
  if (!registration) return 'error'
  try {
    await registration.update()
  } catch {
    return 'error'
  }
  if (registration.installing) await waitInstalled(registration.installing)
  await new Promise((r) => setTimeout(r, 300)) // 等 workbox 触发 onNeedRefresh
  return needRefresh || registration.waiting ? 'available' : 'latest'
}

export async function applyUpdate() {
  await updateSW?.(true)
}

export const appVersion = __APP_VERSION__
```

- [ ] **Step 3: 类型检查**

Run: `npx vue-tsc --noEmit`
Expected: 无错误。

- [ ] **Step 4: Commit**

```bash
git add src/services
git commit -m "feat(services): recorder wrapper and PWA update service

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 8: 状态、路由与通用组件

**Files:**
- Create: `src/store.ts`, `src/router.ts`, `src/components/Avatar.vue`, `src/components/AudioPlayer.vue`
- Modify: `src/App.vue`, `src/main.ts`

- [ ] **Step 1: 全局状态**

`src/store.ts`:
```ts
import { reactive } from 'vue'
import type { Checkin, Meta, Settings, TaskId } from './types'
import { toDateStr } from './core/date'
import { canCheckin } from './core/checkin'
import * as repo from './storage/repo'

export const state = reactive({
  ready: false,
  today: toDateStr(new Date()),
  settings: repo.defaultSettings() as Settings,
  checkins: [] as Checkin[],
  roster: null as string[] | null,
  meta: { a2hsPrompted: false } as Meta,
})

export async function reload() {
  state.settings = await repo.loadSettings()
  state.checkins = await repo.listCheckins()
  state.roster = await repo.loadRoster()
  state.meta = await repo.loadMeta()
  state.today = toDateStr(new Date())
  state.ready = true
}

/** 回到前台或跨天时刷新“今天” */
export function refreshToday() {
  state.today = toDateStr(new Date())
}

export async function updateSettings(s: Settings) {
  await repo.saveSettings(s)
  state.settings = s
}

export async function updateRoster(names: string[] | null) {
  await repo.saveRoster(names)
  state.roster = names
}

export async function markA2hsPrompted() {
  state.meta = { ...state.meta, a2hsPrompted: true }
  await repo.saveMeta(state.meta)
}

export async function submitCheckin(
  taskId: TaskId,
  date: string,
  audio: { blob: Blob; mimeType: string; durationSec: number },
) {
  const verdict = canCheckin(state.checkins, taskId, date, state.today)
  if (!verdict.ok) throw new Error(verdict.reason)
  const audioId = crypto.randomUUID()
  const data = await audio.blob.arrayBuffer()
  const checkin: Checkin = { taskId, date, submittedAt: Date.now(), isMakeup: verdict.isMakeup, durationSec: audio.durationSec, audioId }
  await repo.saveCheckin(checkin, { id: audioId, data, mimeType: audio.mimeType, durationSec: audio.durationSec })
  state.checkins = await repo.listCheckins()
}
```

- [ ] **Step 2: 路由**

`src/router.ts`:
```ts
import { createRouter, createWebHashHistory } from 'vue-router'

export const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/', component: () => import('./views/Home.vue') },
    { path: '/settings', component: () => import('./views/Settings.vue') },
    { path: '/task/:id', component: () => import('./views/TaskDetail.vue') },
    { path: '/task/:id/record', component: () => import('./views/Record.vue') },
    { path: '/task/:id/checkin/:date', component: () => import('./views/CheckinRecord.vue') },
    { path: '/task/:id/rank', component: () => import('./views/Leaderboard.vue') },
  ],
})
```

- [ ] **Step 3: Avatar 组件**

`src/components/Avatar.vue`:
```vue
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
.avatar { border-radius: 50%; display: flex; align-items: center; justify-content: center; color: #fff; font-weight: 600; flex: none; overflow: hidden; align-self: flex-end; }
.avatar { align-self: auto; }
</style>
```

- [ ] **Step 4: AudioPlayer 组件**

`src/components/AudioPlayer.vue`:
```vue
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
```

- [ ] **Step 5: App 外壳（Tab 栏、添加到主屏幕提示）与入口**

`src/App.vue`:
```vue
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
```

`src/main.ts`:
```ts
import { createApp } from 'vue'
import App from './App.vue'
import { router } from './router'
import { refreshToday, reload } from './store'
import { initPwa } from './services/pwa'
import './style.css'

initPwa()
reload().then(() => createApp(App).use(router).mount('#app'))

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') refreshToday()
})
```

- [ ] **Step 6: 类型检查**

Run: `npx vue-tsc --noEmit`
Expected: 报错只会来自尚未创建的 `views/*.vue`（路由动态 import）。`vue-tsc` 对缺失的 .vue 文件会报 "Cannot find module"，这在 Task 9-10 创建后消失，此步可以跳过，改为在 Task 10 结束时统一检查。

- [ ] **Step 7: Commit**

```bash
git add src/store.ts src/router.ts src/components src/App.vue src/main.ts
git commit -m "feat(app): store, router, shell and shared components

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Logo 与图标

**Files:**
- Create: `assets/logo.svg`, `scripts/gen-icons.mjs`, `public/pwa-192.png`, `public/pwa-512.png`, `public/maskable-512.png`, `public/apple-touch-icon.png`

- [ ] **Step 1: 写 Logo 源文件**

`assets/logo.svg`（背景在 `#bg`，图案在 `#glyph`，脚本据此派生其他版本）:
```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#7BD9A5"/>
      <stop offset="1" stop-color="#3BAF7B"/>
    </linearGradient>
  </defs>
  <rect id="bg" width="512" height="512" rx="112" fill="url(#g)"/>
  <g id="glyph">
    <!-- 身体 -->
    <path d="M176 410 Q176 282 256 282 Q336 282 336 410Z" fill="#3F7FD9"/>
    <!-- 头 -->
    <circle cx="256" cy="190" r="64" fill="#FFD9B3"/>
    <!-- 头发 -->
    <path d="M192 186 A64 64 0 0 1 320 186 Q290 150 256 156 Q222 150 192 186Z" fill="#4A3426"/>
    <!-- 低头看书的眼睛与微笑 -->
    <path d="M228 204 Q236 211 244 204 M268 204 Q276 211 284 204" stroke="#4A3426" stroke-width="5" fill="none" stroke-linecap="round"/>
    <path d="M246 226 Q256 235 266 226" stroke="#C8745A" stroke-width="5" fill="none" stroke-linecap="round"/>
    <!-- 腮红 -->
    <circle cx="222" cy="220" r="8" fill="#FFB3A3" opacity=".7"/>
    <circle cx="290" cy="220" r="8" fill="#FFB3A3" opacity=".7"/>
    <!-- 书：封面 -->
    <path d="M136 322 L136 430 L256 452 L376 430 L376 322" fill="#2E6BC0"/>
    <!-- 书：页面 -->
    <path d="M256 338 L146 318 L146 422 L256 442Z" fill="#FFFFFF"/>
    <path d="M256 338 L366 318 L366 422 L256 442Z" fill="#F2F7FF"/>
    <path d="M256 338 L256 442" stroke="#C7D8F0" stroke-width="4"/>
    <!-- 书页文字线 -->
    <path d="M168 350 L236 362 M168 372 L236 384 M168 394 L236 406 M276 362 L344 350 M276 384 L344 372 M276 406 L344 394" stroke="#A9C3E8" stroke-width="6" stroke-linecap="round"/>
    <!-- 双手 -->
    <circle cx="152" cy="412" r="15" fill="#FFD9B3"/>
    <circle cx="360" cy="412" r="15" fill="#FFD9B3"/>
  </g>
</svg>
```

- [ ] **Step 2: 写导出脚本**

`scripts/gen-icons.mjs`:
```js
import { readFileSync } from 'node:fs'
import sharp from 'sharp'

const src = readFileSync(new URL('../assets/logo.svg', import.meta.url), 'utf8')
const out = (name) => new URL(`../public/${name}`, import.meta.url).pathname

// 满铺背景（去圆角），用于 maskable 与 apple-touch-icon（系统自己裁切）
const fullBleed = src.replace('rx="112"', 'rx="0"')
// maskable：主体缩进到中心 80%，避免被裁切
const maskable = fullBleed.replace('<g id="glyph">', '<g id="glyph" transform="translate(51.2 51.2) scale(0.8)">')

const render = (svg, size, file) => sharp(Buffer.from(svg), { density: 384 }).resize(size, size).png().toFile(out(file))

await Promise.all([
  render(src, 192, 'pwa-192.png'),
  render(src, 512, 'pwa-512.png'),
  render(maskable, 512, 'maskable-512.png'),
  render(fullBleed, 180, 'apple-touch-icon.png'),
])
console.log('icons generated')
```

- [ ] **Step 3: 生成并查看效果**

Run: `mkdir -p public && npm run icons`
Expected: 输出 `icons generated`，`public/` 下有 4 个 PNG。

然后用 Read 工具打开 `public/pwa-512.png` 和 `public/maskable-512.png` 查看效果。

- [ ] **Step 4: 请用户确认效果**

把 `pwa-512.png` 的效果给用户看，用户确认后继续。如果要调整，只改 `assets/logo.svg` 后重新 `npm run icons`。

- [ ] **Step 5: Commit**

```bash
git add assets scripts public
git commit -m "feat: reading child logo and generated PWA icons

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 10: 页面（首页、详情、录音、记录、排行榜）

**Files:**
- Create: `src/views/Home.vue`, `src/views/TaskDetail.vue`, `src/views/Record.vue`, `src/views/CheckinRecord.vue`, `src/views/Leaderboard.vue`

- [ ] **Step 1: 首页**

`src/views/Home.vue`:
```vue
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
```

- [ ] **Step 2: 任务详情**

`src/views/TaskDetail.vue`:
```vue
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
.top { display: flex; align-items: center; gap: 8px; padding: 14px 8px; background: #fff; font-weight: 600; }
.back { border: 0; background: none; font-size: 28px; line-height: 1; }
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
.cell .d { font-size: 20px; }
.cell .hint { font-size: 12px; color: #3a7bd5; min-height: 16px; }
.cell.sel { border-color: #43B581; background: #f0fbf5; }
.cell.future { opacity: .5; }
</style>
```

- [ ] **Step 3: 录音页**

`src/views/Record.vue`:
```vue
<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue'
import { onBeforeRouteLeave, useRoute, useRouter } from 'vue-router'
import { state, submitCheckin } from '../store'
import { canCheckin } from '../core/checkin'
import { MAX_SECONDS, MIN_SECONDS, Recorder, type RecordingResult } from '../services/recorder'
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

const recorder = new Recorder()
recorder.onTick = (s) => (sec.value = s)
recorder.onAutoStop = () => stop()

const fmt = (s: number) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
const verdict = canCheckin(state.checkins, taskId, date, state.today)
const tooShort = computed(() => (result.value?.durationSec ?? 0) < MIN_SECONDS)

async function start() {
  error.value = ''
  try {
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
  result.value = await recorder.stop()
  phase.value = 'stopped'
}
function redo() {
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
    router.replace(`/task/${taskId}`)
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
onBeforeUnmount(() => recorder.cancel())
document.addEventListener('visibilitychange', () => {
  if (document.hidden && phase.value === 'recording') error.value = '离开页面后录音可能中断，请回到本页检查。'
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
      <p v-if="error" class="err">{{ error }}</p>
    </div>

    <div v-if="phase === 'stopped'" class="bottom-bar">
      <button class="btn green" :disabled="tooShort || submitting" @click="submit">{{ submitting ? '提交中…' : '提交打卡' }}</button>
    </div>
  </div>
</template>

<style scoped>
.top { display: flex; align-items: center; gap: 8px; padding: 14px 8px; background: #fff; font-weight: 600; }
.back { border: 0; background: none; font-size: 28px; line-height: 1; }
.center { margin: 12px; text-align: center; }
.clock { font-size: 56px; font-variant-numeric: tabular-nums; margin: 24px 0 4px; }
.clock.rec { color: #e5534b; }
.mic { width: 140px; height: 140px; border-radius: 50%; border: 0; background: #43B581; color: #fff; font-size: 20px; margin: 24px 0; }
.ctrl { display: flex; gap: 16px; justify-content: center; margin: 24px 0; }
.review { margin-top: 16px; text-align: left; }
.err { color: #e5534b; font-size: 14px; }
</style>
```

- [ ] **Step 4: 打卡记录页**

`src/views/CheckinRecord.vue`:
```vue
<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { state } from '../store'
import { streakDays } from '../core/checkin'
import { getAudio } from '../storage/repo'
import Avatar from '../components/Avatar.vue'
import AudioPlayer from '../components/AudioPlayer.vue'
import type { TaskId } from '../types'

const route = useRoute()
const router = useRouter()
const taskId = route.params.id as TaskId
const date = route.params.date as string
const checkin = computed(() => state.checkins.find((c) => c.taskId === taskId && c.date === date))
const blob = ref<Blob | null>(null)
const streak = computed(() => streakDays(state.checkins, taskId, state.today))
const name = computed(() => state.settings.name || '我')
const klass = computed(() => state.settings.grade + state.settings.className)
const when = computed(() => {
  if (!checkin.value) return ''
  const d = new Date(checkin.value.submittedAt)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
})

onMounted(async () => {
  if (!checkin.value) return
  const a = await getAudio(checkin.value.audioId)
  if (a) blob.value = new Blob([a.data], { type: a.mimeType })
})
</script>

<template>
  <div class="page">
    <div class="top"><button class="back" @click="router.back()">‹</button><span>打卡记录</span></div>
    <div v-if="checkin" class="card">
      <div class="who">
        <Avatar :name="name" :size="52" color="#8AB4F8" />
        <div class="info">
          <div><strong class="name">{{ name }}</strong> <span class="streak">已坚持{{ streak }}天</span></div>
          <div class="muted">{{ klass }}</div>
        </div>
        <div class="muted time">{{ when }}<br /><span v-if="checkin.isMakeup">补卡</span></div>
      </div>
      <div class="audio">
        <AudioPlayer v-if="blob" :blob="blob" :duration-sec="checkin.durationSec" />
        <p v-else class="muted">录音不存在或已丢失</p>
      </div>
    </div>
    <div v-else class="card muted">没有这天的打卡记录</div>
    <div class="bottom-bar"><div class="end">{{ date < state.today ? '已过打卡日期' : '今日已打卡' }}</div></div>
  </div>
</template>

<style scoped>
.top { display: flex; align-items: center; gap: 8px; padding: 14px 8px; background: #fff; font-weight: 600; }
.back { border: 0; background: none; font-size: 28px; line-height: 1; }
.who { display: flex; gap: 12px; align-items: center; }
.info { flex: 1; }
.name { font-size: 20px; }
.streak { color: #43c7a8; font-size: 15px; }
.time { text-align: right; }
.audio { margin: 16px 0 0 64px; }
.end { text-align: center; color: #bbb; font-size: 20px; padding: 10px; }
</style>
```

- [ ] **Step 5: 排行榜页**

`src/views/Leaderboard.vue`:
```vue
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
.top { display: flex; align-items: center; gap: 8px; padding: 14px 8px; background: #fff; font-weight: 600; border-bottom: 1px solid #eee; }
.back { border: 0; background: none; font-size: 28px; line-height: 1; }
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
```

- [ ] **Step 6: 设置页占位（让类型检查能通过，Task 11 完整实现）**

`src/views/Settings.vue`:
```vue
<template><div class="page card">设置</div></template>
```

- [ ] **Step 7: 类型检查与构建**

Run: `npx vue-tsc --noEmit && npx vite build 2>&1 | tail -5`
Expected: 无类型错误，构建成功。

- [ ] **Step 8: 本地冒烟**

Run: `npm run dev`，用桌面 Chrome 打开提示的地址（`localhost` 允许麦克风）。检查：首页两张卡片；进入任务详情；点「打卡」→ 录音 → 停止 → 提交；回到详情看到当天打勾；打开排行榜看到本人有高亮行。

- [ ] **Step 9: Commit**

```bash
git add src/views
git commit -m "feat(views): home, task detail, record, check-in record, leaderboard

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 11: 设置页

**Files:**
- Modify: `src/views/Settings.vue`（整体替换）

- [ ] **Step 1: 实现设置页**

`src/views/Settings.vue`:
```vue
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
    const file = new File([bytes], `阅读打卡备份-${toDateStr(new Date())}.zip`, { type: 'application/zip' })
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
    <h2 class="head">设置</h2>
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
.head { margin: 0; padding: 20px 16px 12px; }
.msg { margin: 0 0 8px; padding: 10px 16px; background: #e8f6ee; color: #2a8a5c; }
.card { margin-bottom: 10px; }
h3 { margin: 0 0 10px; }
label { display: block; margin-bottom: 10px; font-size: 14px; color: #666; }
input, textarea { display: block; width: 100%; margin-top: 4px; padding: 10px; font: inherit; font-size: 16px; border: 1px solid #ddd; border-radius: 4px; }
.actions { display: flex; flex-wrap: wrap; gap: 10px; }
.file { display: inline-flex; align-items: center; margin: 0; color: #fff; }
</style>
```

- [ ] **Step 2: 类型检查与构建**

Run: `npx vue-tsc --noEmit && npx vite build 2>&1 | tail -5`
Expected: 无错误；`dist/` 下有 `sw.js` 和 `manifest.webmanifest`。

- [ ] **Step 3: 本地验证**

Run: `npm run build && npm run preview`
在浏览器打开预览地址，检查：
1. 设置里填姓名/年级/班级并保存，回到打卡记录页能看到。
2. 导入一个 `["甲","乙","丙"]` 的 JSON，排行榜变成 4 行（含本人）。
3. 导出备份得到 `.zip`；清空记录后导入，打卡记录和录音恢复。
4. 点「检查并更新」：未改动时显示「已是最新版本」。

- [ ] **Step 4: Commit**

```bash
git add src/views/Settings.vue
git commit -m "feat(settings): profile, roster import, backup, update check

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 12: 部署到 GitHub Pages

**Files:**
- Create: `.github/workflows/deploy.yml`

- [ ] **Step 1: 写工作流**

`.github/workflows/deploy.yml`:
```yaml
name: Deploy to GitHub Pages

on:
  push:
    branches: [main]
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: pages
  cancel-in-progress: true

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
      - run: npm ci
      - run: npm test
      - run: npm run build
        env:
          VITE_BASE: /${{ github.event.repository.name }}/
      - uses: actions/upload-pages-artifact@v3
        with:
          path: dist

  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - id: deployment
        uses: actions/deploy-pages@v4
```

- [ ] **Step 2: 验证带子路径构建**

Run: `VITE_BASE=/reading/ npm run build && grep -o 'start_url[^,]*' dist/manifest.webmanifest; grep -o 'href="[^"]*apple-touch-icon[^"]*"' dist/index.html`
Expected: `start_url` 与图标路径都以 `/reading/` 开头。

- [ ] **Step 3: Commit 并推送**

```bash
git add .github
git commit -m "ci: deploy to GitHub Pages

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
git push -u origin main
```

推送会把代码发到公开远程，执行前先向用户确认；并确认仓库是公开的还是私有的，Pages 对私有仓库需要付费套餐。

- [ ] **Step 4: 用户在 GitHub 上启用 Pages（手动一次）**

仓库 Settings → Pages → Build and deployment → Source 选 **GitHub Actions**。随后重新运行工作流，访问 `https://amither.github.io/reading/`。

---

### Task 13: iPhone 真机验证清单

- [ ] 用 Safari 打开线上地址，点「分享」→「添加到主屏幕」，主屏幕图标是小孩阅读的 Logo，名称为「阅读打卡」。
- [ ] 从主屏幕启动（全屏、无地址栏），首次提示「添加到主屏幕」不再出现。
- [ ] 点「打卡」→「开始录音」，系统弹出麦克风授权，允许后能录音；暂停/继续正常；少于 3 秒不能提交。
- [ ] 录音时锁屏再回来，确认录音状态（预期可能中断，页面有提示）。
- [ ] 提交后详情页当天打勾；「查看详情」里能播放录音，时长与进度条正常。
- [ ] 补卡：改系统日期到周中（或等到周中）验证缺卡日期可补，补满 3 次后按钮置灰并提示「本周补卡次数已用完」。
- [ ] 排行榜：本人高亮，名次连续；杀掉 App 重开，同一时段榜单不变。
- [ ] 开飞行模式打开 App，页面和已录音频仍可用（离线）。
- [ ] 在设置里导出备份，存到「文件」；清空后再导入，记录与录音恢复。
- [ ] 发布一个新版本（改一下版本号或文案推送），回到 App 点「检查并更新」，出现「发现新版本」，确认后页面刷新且数据还在。

---

## Self-Review

**Spec 覆盖：**
- 两个独立任务、各自周期/日历/排行榜：Task 3、10（`taskId` 贯穿）。
- 自然周、补卡 3 次规则、跨周限制：Task 2、3。
- 排行榜确定性、全员、密集排名、实时感、头像 40% 默认：Task 4、10。
- 同学名单本地导入/清除、内置 30 个姓名：Task 4、11。
- 本人姓名/年级/班级：Task 11、10。
- 备份导出导入（覆盖/合并）、persist、添加到主屏幕提示：Task 6、7、8、11。
- 任务文案可编辑：Task 5（默认值）、11。
- 检查并更新、版本号：Task 7、11。
- 录音格式探测、最短 3 秒、最长 30 分钟、Wake Lock、权限引导、退出确认：Task 7、10。
- Logo、maskable、apple-touch-icon、先预览再用：Task 9。
- GitHub Pages、hash 路由、base：Task 1、8、12。
- 不提供单条删除：设置页只有「清空记录」。
- 「录音开始那天为准」：Record.vue 进入页面时就锁定 `date`；提交校验用 `state.today`，若录音跨过 0 点，今日打卡会因日期已变成“过去的缺卡日”而改为补卡。这个边界按补卡额度走，是有意保留的行为。

**占位符扫描：** 无 TBD/TODO；所有代码步骤都有完整代码。Task 8 Step 6 明确说明了类型检查为何跳过。

**类型一致性：** `Checkin`、`AudioRecord`、`Settings` 定义在 `src/types.ts`，repo/backup/store/视图均沿用。`canCheckin` 返回 `{ok, isMakeup}|{ok:false, reason}`，在 store 与视图中一致使用。`buildLeaderboard` 的入参 `names/taskId/today/hour/me` 在测试与 Leaderboard.vue 中一致。`checkForUpdate` 返回 `'available'|'latest'|'error'`，Settings.vue 按此处理。

**已知取舍：**
- 排行榜“实时感”会让虚拟同学的天数在 `[max(0,n-2), n]` 之外再少 1（未到完成时刻时），所以下限可能是 `n-3`。这与设计文档“下午之前未打卡者少算一天”的意思一致，只是文档里的区间没有把这一天算进去。
- 导入备份用两次 `confirm` 选择覆盖/合并，是最省事的写法，样式简陋，后续可以换成自定义对话框。
