import { toHex, unpackColor, type PixelBuffer } from './pixels'

export interface ColorStat {
  hex: string
  count: number
}

export interface CanvasStats {
  width: number
  height: number
  total: number
  painted: number
  coverage: number
  bbox: { minX: number; minY: number; maxX: number; maxY: number } | null
  colors: ColorStat[]
}

export interface PixelInfo {
  x: number
  y: number
  hex: string
  r: number
  g: number
  b: number
  a: number
}

export function analyze(buf: PixelBuffer): CanvasStats {
  const { width, height, data32 } = buf
  const counts = new Map<number, number>()
  let painted = 0
  let minX = width
  let minY = height
  let maxX = -1
  let maxY = -1
  for (let y = 0; y < height; y++) {
    const row = y * width
    for (let x = 0; x < width; x++) {
      const v = data32[row + x]
      if (v >>> 24 === 0) continue
      painted++
      counts.set(v, (counts.get(v) ?? 0) + 1)
      if (x < minX) minX = x
      if (x > maxX) maxX = x
      if (y < minY) minY = y
      if (y > maxY) maxY = y
    }
  }
  const total = width * height
  return {
    width,
    height,
    total,
    painted,
    coverage: total ? painted / total : 0,
    bbox: painted ? { minX, minY, maxX, maxY } : null,
    colors: [...counts]
      .map(([v, count]) => ({ hex: toHex(v), count }))
      .sort((a, b) => b.count - a.count),
  }
}

/** Закрашенные пиксели в порядке построчного обхода (не больше limit). */
export function listPixels(buf: PixelBuffer, limit: number): PixelInfo[] {
  const { width, height, data32 } = buf
  const out: PixelInfo[] = []
  if (limit <= 0) return out
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const v = data32[y * width + x]
      if (v >>> 24 === 0) continue
      out.push({ x, y, hex: toHex(v), ...unpackColor(v) })
      if (out.length >= limit) return out
    }
  }
  return out
}

/**
 * Полное состояние холста в компактном виде:
 * rows[y] = [[x, длина, индекс в palette], ...] — горизонтальные серии одного цвета.
 */
export function stateToJson(buf: PixelBuffer): string {
  const { width, height, data32 } = buf
  const palette: string[] = []
  const paletteIndex = new Map<number, number>()
  const rows: Record<number, number[][]> = {}
  let painted = 0
  for (let y = 0; y < height; y++) {
    const runs: number[][] = []
    let x = 0
    while (x < width) {
      const v = data32[y * width + x]
      if (v >>> 24 === 0) {
        x++
        continue
      }
      let end = x + 1
      while (end < width && data32[y * width + end] === v) end++
      let idx = paletteIndex.get(v)
      if (idx === undefined) {
        idx = palette.length
        palette.push(toHex(v))
        paletteIndex.set(v, idx)
      }
      runs.push([x, end - x, idx])
      painted += end - x
      x = end
    }
    if (runs.length) rows[y] = runs
  }
  return JSON.stringify({ width, height, painted, palette, rows })
}
