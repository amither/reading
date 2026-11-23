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
