import { describe, expect, it } from 'vitest'
import { toSvg } from './export'
import { createBuffer, packColor, strokeLine, toHex } from './pixels'
import { listPixels } from './stats'

/** Разбор нашего SVG обратно в карту пикселей. */
function rasterize(svg: string): Map<string, string> {
  const out = new Map<string, string>()
  for (const [, fill, d] of svg.matchAll(/<path fill="(#[0-9a-f]{6})" d="([^"]*)"/g)) {
    for (const [, x, y, w, h] of d.matchAll(/M(\d+) (\d+)h(\d+)v(\d+)h-\d+z/g)) {
      for (let j = 0; j < +h; j++)
        for (let i = 0; i < +w; i++) out.set(`${+x + i},${+y + j}`, fill)
    }
  }
  return out
}

describe('toSvg', () => {
  it('declares the canvas size and has no shapes when empty', () => {
    const svg = toSvg(createBuffer(7, 5))
    expect(svg).toContain('width="7" height="5" viewBox="0 0 7 5"')
    expect(svg).not.toContain('<path')
  })

  it('merges identical rows into one rect', () => {
    const buf = createBuffer(6, 6)
    for (let y = 1; y <= 3; y++)
      for (let x = 2; x <= 4; x++) buf.data32[y * 6 + x] = packColor('#abcdef')
    const svg = toSvg(buf)
    expect(svg.match(/M\d+ \d+h/g)).toEqual(['M2 1h'])
    expect(svg).toContain('d="M2 1h3v3h-3z"')
  })

  it('does not merge rows that differ in x, width or color', () => {
    const buf = createBuffer(6, 3)
    buf.data32[0] = packColor('#111111')
    buf.data32[1 * 6 + 1] = packColor('#111111') // другой x
    buf.data32[2 * 6 + 1] = packColor('#222222') // тот же x, другой цвет
    const rects = [...toSvg(buf).matchAll(/M\d+ \d+h/g)]
    expect(rects).toHaveLength(3)
  })

  it('reproduces every pixel exactly (round-trip)', () => {
    const buf = createBuffer(60, 40)
    const strokes: [string, number, number, number, number, number][] = [
      ['#e5484d', 3, 3, 50, 30, 5],
      ['#0091ff', 10, 35, 55, 5, 3],
      ['#30a46c', 30, 0, 30, 39, 1],
    ]
    for (const [c, x0, y0, x1, y1, size] of strokes)
      strokeLine(buf, x0, y0, x1, y1, { color: packColor(c), size, shape: 'round' })

    const expected = new Map(listPixels(buf, Infinity).map((p) => [`${p.x},${p.y}`, p.hex]))
    const actual = rasterize(toSvg(buf))
    expect(actual).toEqual(expected)
    expect(toHex(buf.data32[0])).toBe('#000000')
  })
})
