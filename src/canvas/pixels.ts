export interface PixelBuffer {
  width: number
  height: number
  image: ImageData
  /** The same buffer as image.data, but one pixel per element (ABGR, little-endian). */
  data32: Uint32Array
}

export type BrushShape = 'square' | 'round'

export interface Brush {
  color: number
  size: number
  shape: BrushShape
}

export interface Rect {
  x: number
  y: number
  w: number
  h: number
}

export function createBuffer(width: number, height: number): PixelBuffer {
  const image = new ImageData(width, height)
  return { width, height, image, data32: new Uint32Array(image.data.buffer) }
}

/** '#rrggbb' -> packed opaque ABGR. */
export function packColor(hex: string): number {
  const n = parseInt(hex.slice(1), 16)
  const r = (n >> 16) & 255
  const g = (n >> 8) & 255
  const b = n & 255
  return ((255 << 24) | (b << 16) | (g << 8) | r) >>> 0
}

export function unpackColor(v: number) {
  return { r: v & 255, g: (v >>> 8) & 255, b: (v >>> 16) & 255, a: v >>> 24 }
}

export function toHex(v: number): string {
  const { r, g, b } = unpackColor(v)
  return '#' + [r, g, b].map((c) => c.toString(16).padStart(2, '0')).join('')
}

/** Resamples to a new size (nearest neighbour): the drawing is stretched together with the canvas. */
export function resample(src: PixelBuffer, width: number, height: number): PixelBuffer {
  if (src.width === width && src.height === height) return src
  const dst = createBuffer(width, height)
  for (let y = 0; y < height; y++) {
    const sy = Math.min(src.height - 1, Math.floor(((y + 0.5) * src.height) / height))
    for (let x = 0; x < width; x++) {
      const sx = Math.min(src.width - 1, Math.floor(((x + 0.5) * src.width) / width))
      dst.data32[y * width + x] = src.data32[sy * src.width + sx]
    }
  }
  return dst
}

const maskCache = new Map<string, Int32Array>()

/** Offsets (dx, dy) of the brush pixels relative to its center. */
function brushMask(size: number, shape: BrushShape): Int32Array {
  const key = `${shape}:${size}`
  const cached = maskCache.get(key)
  if (cached) return cached
  const offsets: number[] = []
  const r = size / 2
  const origin = Math.floor(size / 2)
  for (let j = 0; j < size; j++) {
    for (let i = 0; i < size; i++) {
      const inside =
        shape === 'square' || (i + 0.5 - r) ** 2 + (j + 0.5 - r) ** 2 <= r * r
      if (inside) offsets.push(i - origin, j - origin)
    }
  }
  const mask = Int32Array.from(offsets)
  if (maskCache.size > 64) maskCache.clear()
  maskCache.set(key, mask)
  return mask
}

function stamp(buf: PixelBuffer, cx: number, cy: number, brush: Brush, mask: Int32Array) {
  const { width, height, data32 } = buf
  for (let i = 0; i < mask.length; i += 2) {
    const x = cx + mask[i]
    const y = cy + mask[i + 1]
    if (x >= 0 && y >= 0 && x < width && y < height) data32[y * width + x] = brush.color
  }
}

/** Bresenham line drawn with brush stamps. Returns the changed area (for partial redraws). */
export function strokeLine(
  buf: PixelBuffer,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  brush: Brush,
): Rect {
  const mask = brushMask(brush.size, brush.shape)
  const dx = Math.abs(x1 - x0)
  const dy = -Math.abs(y1 - y0)
  const sx = x0 < x1 ? 1 : -1
  const sy = y0 < y1 ? 1 : -1
  let err = dx + dy
  let x = x0
  let y = y0
  for (;;) {
    stamp(buf, x, y, brush, mask)
    if (x === x1 && y === y1) break
    const e2 = 2 * err
    if (e2 >= dy) {
      err += dy
      x += sx
    }
    if (e2 <= dx) {
      err += dx
      y += sy
    }
  }
  const reach = Math.ceil(brush.size / 2) + 1
  const left = Math.max(0, Math.min(x0, x1) - reach)
  const top = Math.max(0, Math.min(y0, y1) - reach)
  const right = Math.min(buf.width, Math.max(x0, x1) + reach + 1)
  const bottom = Math.min(buf.height, Math.max(y0, y1) + reach + 1)
  return { x: left, y: top, w: right - left, h: bottom - top }
}
