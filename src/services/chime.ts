/** 提示音：用 Web Audio 合成的「叮叮叮」，不需要音频文件 */
export class Chime {
  private ctx: AudioContext | null = null

  /** 必须在用户点击的同步流程里调用：iOS 只允许在手势里启动音频 */
  prime() {
    if (this.ctx) return
    const AC = window.AudioContext || (window as any).webkitAudioContext
    if (!AC) return
    this.ctx = new AC()
    void this.ctx.resume()
  }

  /** 播放两遍上行的三音「叮叮叮」 */
  play() {
    const ctx = this.ctx
    if (!ctx) return
    void ctx.resume()
    const t0 = ctx.currentTime + 0.05
    for (const offset of [0, 1.1]) {
      ;[880, 1175, 1568].forEach((freq, i) => {
        const start = t0 + offset + i * 0.18
        const osc = ctx.createOscillator()
        const gain = ctx.createGain()
        osc.type = 'sine'
        osc.frequency.value = freq
        gain.gain.setValueAtTime(0, start)
        gain.gain.linearRampToValueAtTime(0.3, start + 0.02)
        gain.gain.exponentialRampToValueAtTime(0.001, start + 0.5)
        osc.connect(gain).connect(ctx.destination)
        osc.start(start)
        osc.stop(start + 0.55)
      })
    }
  }

  close() {
    void this.ctx?.close().catch(() => {})
    this.ctx = null
  }
}
