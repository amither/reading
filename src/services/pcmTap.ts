import { Resampler } from '../core/wav'

export const PCM_RATE = 16000

// AudioWorklet 处理器：攒满 4096 个采样再发回主线程，减少消息数
const WORKLET = `
class PcmTap extends AudioWorkletProcessor {
  constructor() {
    super()
    this.buf = new Float32Array(4096)
    this.n = 0
    this.on = true
    this.port.onmessage = (e) => { this.on = e.data === 'on' }
  }
  process(inputs) {
    const ch = inputs[0] && inputs[0][0]
    if (ch && this.on) {
      for (let i = 0; i < ch.length; i++) {
        this.buf[this.n++] = ch[i]
        if (this.n === this.buf.length) { this.port.postMessage(this.buf.slice(0)); this.n = 0 }
      }
    }
    return true
  }
}
registerProcessor('pcm-tap', PcmTap)
`

/** 从麦克风流旁路取 16kHz 单声道 PCM，不影响 MediaRecorder */
export class PcmTap {
  private readonly ctx: AudioContext
  private node: AudioWorkletNode | null = null
  private source: MediaStreamAudioSourceNode | null = null

  /** 必须在用户点击的同步流程里创建：iOS 要求在手势里 resume */
  constructor() {
    const AC = window.AudioContext || (window as any).webkitAudioContext
    this.ctx = new AC()
    void this.ctx.resume()
  }

  async attach(stream: MediaStream, onChunk: (pcm: Float32Array) => void) {
    if (!this.ctx.audioWorklet) throw new Error('当前浏览器不支持 AudioWorklet')
    const url = URL.createObjectURL(new Blob([WORKLET], { type: 'application/javascript' }))
    try {
      await this.ctx.audioWorklet.addModule(url)
    } finally {
      URL.revokeObjectURL(url)
    }
    const resampler = new Resampler(this.ctx.sampleRate, PCM_RATE)
    this.source = this.ctx.createMediaStreamSource(stream)
    this.node = new AudioWorkletNode(this.ctx, 'pcm-tap')
    this.node.port.onmessage = (e: MessageEvent<Float32Array>) => {
      const out = resampler.process(e.data)
      if (out.length) onChunk(out)
    }
    // iOS 上没有接到输出的节点可能不会被驱动，接一个静音增益到 destination
    const mute = this.ctx.createGain()
    mute.gain.value = 0
    this.source.connect(this.node)
    this.node.connect(mute)
    mute.connect(this.ctx.destination)
  }

  pause() {
    this.node?.port.postMessage('off')
  }

  resume() {
    this.node?.port.postMessage('on')
  }

  stop() {
    if (this.node) this.node.port.onmessage = null
    try {
      this.source?.disconnect()
      this.node?.disconnect()
    } catch {
      /* 已断开 */
    }
    void this.ctx.close().catch(() => {})
    this.node = null
    this.source = null
  }
}
