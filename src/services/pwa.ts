import { registerSW } from 'virtual:pwa-register'
import { formatBuildTime } from '../core/date'

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

export const appVersion = `${__APP_VERSION__} (${formatBuildTime(__BUILD_TIME__)})`
