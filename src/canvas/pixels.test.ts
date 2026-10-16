import { describe, expect, it } from 'vitest'
import {
  createBuffer,
  packColor,
  resample,
  strokeLine,
  toHex,
  unpackColor,
  type Brush,
  type PixelBuffer,
} from './pixels'

const RED = packColor('#ff0000')

const brush = (size: number, shape: Brush['shape'] = 'square'): Brush => ({
  color: RED,
  size,
  shape,
})

function paintedSet(buf: PixelBuffer): Set<string> {
  const out = new Set<string>()
  for (let y = 0; y < buf.height; y++)
    for (let x = 0; x < buf.width; x++)
      if (buf.data32[y * buf.width + x] >>> 24) out.add(`${x},${y}`)
  return out
}

describe('colors', () => {
  it('packs to opaque ABGR and round-trips through hex', () => {
    expect(unpackColor(packColor('#123456'))).toEqual({ r: 0x12, g: 0x34, b: 0x56, a: 255 })
    for (const hex of ['#000000', '#ffffff', '#e5484d', '#0a0b0c']) {
      expect(toHex(packColor(hex))).toBe(hex)
    }
  })

  it('writes the same bytes into ImageData as RGBA', () => {
    const buf = createBuffer(2, 1)
    buf.data32[1] = packColor('#102030')
    expect([...buf.image.data]).toEqual([0, 0, 0, 0, 0x10, 0x20, 0x30, 255])
  })
})

describe('strokeLine', () => {
  it('paints a single pixel for a 1px brush', () => {
    const buf = createBuffer(10, 10)
    strokeLine(buf, 3, 4, 3, 4, brush(1))
    expect(paintedSet(buf)).toEqual(new Set(['3,4']))
  })

  it('stamps a square brush around the center (even sizes extend up-left)', () => {
    const odd = createBuffer(10, 10)
    strokeLine(odd, 5, 5, 5, 5, brush(3))
    expect(odd.data32.filter((v) => v).length).toBe(9)
    expect(paintedSet(odd).has('4,4') && paintedSet(odd).has('6,6')).toBe(true)

    const even = createBuffer(10, 10)
    strokeLine(even, 5, 5, 5, 5, brush(2))
    expect(paintedSet(even)).toEqual(new Set(['4,4', '5,4', '4,5', '5,5']))
  })

  it('round brush cuts the corners', () => {
    const buf = createBuffer(11, 11)
    strokeLine(buf, 5, 5, 5, 5, brush(5, 'round'))
    const set = paintedSet(buf)
    expect(set.size).toBe(21)
    expect(set.has('5,5')).toBe(true)
    expect(set.has('3,3')).toBe(false)
    expect(set.has('7,7')).toBe(false)
  })

  it('draws a gap-free horizontal, vertical and diagonal line', () => {
    const h = createBuffer(20, 5)
    strokeLine(h, 2, 2, 17, 2, brush(1))
    expect(paintedSet(h).size).toBe(16)

    const v = createBuffer(5, 20)
    strokeLine(v, 2, 17, 2, 2, brush(1))
    expect(paintedSet(v).size).toBe(16)

    const d = createBuffer(20, 20)
    strokeLine(d, 0, 0, 19, 19, brush(1))
    expect(paintedSet(d)).toEqual(new Set(Array.from({ length: 20 }, (_, i) => `${i},${i}`)))
  })

  it('is symmetric: the same pixels regardless of direction', () => {
    const a = createBuffer(30, 30)
    const b = createBuffer(30, 30)
    strokeLine(a, 2, 3, 25, 17, brush(1))
    strokeLine(b, 25, 17, 2, 3, brush(1))
    expect(paintedSet(a).size).toBe(paintedSet(b).size)
  })

  it('clips at the edges and tolerates points outside the buffer', () => {
    const buf = createBuffer(5, 5)
    expect(() => strokeLine(buf, -10, -10, 20, 20, brush(3))).not.toThrow()
    expect(buf.data32.length).toBe(25)
    expect(paintedSet(buf).has('0,0')).toBe(true)

    const corner = createBuffer(5, 5)
    strokeLine(corner, 0, 0, 0, 0, brush(3))
    expect(paintedSet(corner).size).toBe(4)
  })

  it('returns a dirty rect that contains every changed pixel and stays in bounds', () => {
    const cases: [number, number, number, number, number][] = [
      [10, 10, 40, 25, 1],
      [0, 0, 49, 49, 7],
      [49, 3, 0, 40, 4],
      [25, 25, 25, 25, 9],
    ]
    for (const [x0, y0, x1, y1, size] of cases) {
      const buf = createBuffer(50, 50)
      const r = strokeLine(buf, x0, y0, x1, y1, brush(size, 'round'))
      expect(r.x).toBeGreaterThanOrEqual(0)
      expect(r.y).toBeGreaterThanOrEqual(0)
      expect(r.x + r.w).toBeLessThanOrEqual(50)
      expect(r.y + r.h).toBeLessThanOrEqual(50)
      for (const key of paintedSet(buf)) {
        const [x, y] = key.split(',').map(Number)
        expect(x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h).toBe(true)
      }
    }
  })

  it('overwrites previous colors', () => {
    const buf = createBuffer(5, 5)
    strokeLine(buf, 2, 2, 2, 2, brush(1))
    strokeLine(buf, 2, 2, 2, 2, { ...brush(1), color: packColor('#00ff00') })
    expect(toHex(buf.data32[2 * 5 + 2])).toBe('#00ff00')
  })
})

describe('resample', () => {
  it('returns the same buffer when the size is unchanged', () => {
    const buf = createBuffer(4, 4)
    expect(resample(buf, 4, 4)).toBe(buf)
  })

  it('scales painted regions proportionally (up and down)', () => {
    const buf = createBuffer(4, 4)
    strokeLine(buf, 0, 0, 1, 1, brush(1)) // верхний левый квадрант: (0,0) и (1,1)
    const up = resample(buf, 8, 8)
    expect(up.width).toBe(8)
    expect(up.data32[0]).toBe(RED)
    expect(up.data32[1 * 8 + 1]).toBe(RED)
    expect(up.data32[7 * 8 + 7]).toBe(0)

    const full = createBuffer(4, 4)
    full.data32.fill(RED)
    const down = resample(full, 2, 2)
    expect([...down.data32]).toEqual([RED, RED, RED, RED])
  })

  it('handles aspect ratio changes without reading out of bounds', () => {
    const buf = createBuffer(16, 9)
    buf.data32.fill(RED)
    for (const [w, h] of [[9, 16], [1, 1], [5040, 2160], [72, 128]]) {
      const out = resample(buf, w, h)
      expect(out.data32.length).toBe(w * h)
      expect(out.data32.every((v) => v === RED)).toBe(true)
    }
  })
})
