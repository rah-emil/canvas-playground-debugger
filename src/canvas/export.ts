import { toHex, type PixelBuffer } from './pixels'

export type ExportFormat = 'png' | 'jpg' | 'webp' | 'svg'

const MIME = {
  png: 'image/png',
  jpg: 'image/jpeg',
  webp: 'image/webp',
} as const

function drawToCanvas(buf: PixelBuffer, background?: string): HTMLCanvasElement {
  const source = document.createElement('canvas')
  source.width = buf.width
  source.height = buf.height
  source.getContext('2d')!.putImageData(buf.image, 0, 0)
  if (!background) return source

  // JPG не поддерживает прозрачность — подкладываем фон.
  const flat = document.createElement('canvas')
  flat.width = buf.width
  flat.height = buf.height
  const ctx = flat.getContext('2d')!
  ctx.fillStyle = background
  ctx.fillRect(0, 0, buf.width, buf.height)
  ctx.drawImage(source, 0, 0)
  return flat
}

function toRasterBlob(buf: PixelBuffer, format: 'png' | 'jpg' | 'webp'): Promise<Blob> {
  const mime = MIME[format]
  const canvas = drawToCanvas(buf, format === 'jpg' ? '#ffffff' : undefined)
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        // Браузер молча отдаёт PNG, если не умеет кодировать нужный формат.
        if (!blob || blob.type !== mime) reject(new Error(`Браузер не поддерживает экспорт в ${format}`))
        else resolve(blob)
      },
      mime,
      format === 'png' ? undefined : 0.95,
    )
  })
}

/** Векторизация: одинаковые горизонтальные серии склеиваются по вертикали, один <path> на цвет. */
export function toSvg(buf: PixelBuffer): string {
  const { width, height, data32 } = buf
  interface Rect {
    x: number
    y: number
    w: number
    h: number
    color: number
  }
  const byColor = new Map<number, Rect[]>()
  let open = new Map<string, Rect>()

  for (let y = 0; y < height; y++) {
    const next = new Map<string, Rect>()
    let x = 0
    while (x < width) {
      const v = data32[y * width + x]
      if (v >>> 24 === 0) {
        x++
        continue
      }
      let end = x + 1
      while (end < width && data32[y * width + end] === v) end++
      const key = `${x},${end - x},${v}`
      let rect = open.get(key)
      if (rect) {
        rect.h++
      } else {
        rect = { x, y, w: end - x, h: 1, color: v }
        const list = byColor.get(v)
        if (list) list.push(rect)
        else byColor.set(v, [rect])
      }
      next.set(key, rect)
      x = end
    }
    open = next
  }

  const paths = [...byColor]
    .map(([color, rects]) => {
      const d = rects.map((r) => `M${r.x} ${r.y}h${r.w}v${r.h}h-${r.w}z`).join('')
      return `<path fill="${toHex(color)}" d="${d}"/>`
    })
    .join('')
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" ` +
    `viewBox="0 0 ${width} ${height}" shape-rendering="crispEdges">${paths}</svg>`
  )
}

export async function exportBlob(buf: PixelBuffer, format: ExportFormat): Promise<Blob> {
  if (format === 'svg') return new Blob([toSvg(buf)], { type: 'image/svg+xml' })
  return toRasterBlob(buf, format)
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.append(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
