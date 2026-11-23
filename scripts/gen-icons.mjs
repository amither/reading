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
