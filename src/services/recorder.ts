import { PcmTap } from './pcmTap'
import { ScreenAwake } from './screenAwake'

export const MIN_SECONDS = 3
export const MAX_SECONDS = 30 * 60
/** 录到这个时长时在录音页提醒孩子，快到上限了 */
export const REMIND_SECONDS = 20 * 60

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
  private tap: PcmTap | null = null
  private chunks: Blob[] = []
  private accumulatedMs = 0
  private segmentStart = 0
  private wakeLock = new ScreenAwake()
  private timer: number | null = null
  /** 已录时长（秒），含暂停前的累计 */
  elapsedSec = 0
  onTick: (sec: number) => void = () => {}
  onAutoStop: () => void = () => {}
  /** 设置后，录音时会同时输出 16kHz 单声道 PCM（用于实时识别） */
  onPcm: ((pcm: Float32Array) => void) | null = null
  /** PCM 旁路启动失败（如浏览器不支持）时回调，录音本身不受影响 */
  onPcmUnavailable: () => void = () => {}

  /** 屏幕常亮状态变化（录音期间） */
  set onAwakeChange(f: (active: boolean) => void) {
    this.wakeLock.onChange = f
  }

  async start() {
    // AudioContext 必须在任何 await 之前创建，才算在点击手势里
    const tap = this.onPcm ? new PcmTap() : null
    // 常亮锁也尽早在点击流程里申请；切到后台被释放后会自动重新申请
    const awake = this.wakeLock.acquire()
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    } catch (e) {
      tap?.stop()
      this.wakeLock.release()
      throw e
    }
    const mime = pickMimeType()
    this.rec = new MediaRecorder(this.stream, mime ? { mimeType: mime } : undefined)
    this.chunks = []
    this.accumulatedMs = 0
    this.rec.ondataavailable = (e) => e.data.size && this.chunks.push(e.data)
    this.rec.start(1000)
    this.segmentStart = Date.now()
    this.startTick()
    if (tap) {
      try {
        await tap.attach(this.stream, this.onPcm!)
        this.tap = tap
      } catch {
        tap.stop()
        this.onPcmUnavailable()
      }
    }
    await awake
  }

  pause() {
    this.rec?.pause()
    this.tap?.pause()
    this.accumulatedMs += Date.now() - this.segmentStart
    this.stopTick()
  }

  resume() {
    this.rec?.resume()
    this.tap?.resume()
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
    this.tap?.stop()
    this.tap = null
    this.stream?.getTracks().forEach((t) => t.stop())
    this.stream = null
    this.wakeLock.release()
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
