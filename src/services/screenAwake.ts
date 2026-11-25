type Sentinel = { released: boolean; release(): Promise<void>; addEventListener(t: 'release', f: () => void): void }

/**
 * 录音期间保持屏幕常亮（Screen Wake Lock API）。
 * 浏览器在页面切到后台时会自动释放常亮锁，回到前台后需要重新申请，这里自动处理。
 */
export class ScreenAwake {
  private sentinel: Sentinel | null = null
  private wanted = false
  /** 常亮状态变化时回调：true 已常亮，false 未常亮（不支持、被拒绝或已释放） */
  onChange: (active: boolean) => void = () => {}

  static get supported(): boolean {
    return typeof navigator !== 'undefined' && 'wakeLock' in navigator
  }

  get active(): boolean {
    return !!this.sentinel && !this.sentinel.released
  }

  /** 开始保持常亮；在点击的流程里调用最稳妥 */
  async acquire() {
    if (!this.wanted) {
      this.wanted = true
      document.addEventListener('visibilitychange', this.onVisibility)
    }
    await this.request()
  }

  release() {
    this.wanted = false
    document.removeEventListener('visibilitychange', this.onVisibility)
    const s = this.sentinel
    this.sentinel = null
    s?.release().catch(() => {})
    this.onChange(false)
  }

  private async request() {
    if (!ScreenAwake.supported || this.active || document.visibilityState !== 'visible') {
      this.onChange(this.active)
      return
    }
    try {
      const s = (await (navigator as any).wakeLock.request('screen')) as Sentinel
      if (!this.wanted) {
        // 申请过程中录音已经结束
        s.release().catch(() => {})
        return
      }
      this.sentinel = s
      s.addEventListener('release', () => {
        if (this.sentinel === s) this.onChange(false)
      })
      this.onChange(true)
    } catch {
      this.onChange(false)
    }
  }

  private onVisibility = () => {
    if (this.wanted && document.visibilityState === 'visible') void this.request()
  }
}
