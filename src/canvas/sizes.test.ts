import { describe, expect, it } from 'vitest'
import { toSvg } from './export'
import { JSON_EXPORT_FORMATS } from './formats'
import { createBuffer, packColor, strokeLine } from './pixels'
import { analyze } from './stats'
import { SIZE_TARGETS, formatBytes } from './sizes'

describe('formatBytes', () => {
  it.each([
    [0, '0 Б'],
    [999, '999 Б'],
    [1023, '1023 Б'],
    [1024, '1 КБ'],
    [1536, '1,5 КБ'],
    [10 * 1024, '10 КБ'],
    [1024 * 1024 - 1, '1 024 КБ'],
    [1024 * 1024, '1 МБ'],
    [5.5 * 1024 * 1024, '5,5 МБ'],
  ])('%i -> %s', (bytes, text) => {
    expect(formatBytes(bytes).replace(/ /g, ' ')).toBe(text)
  })
})

describe('SIZE_TARGETS', () => {
  const buf = createBuffer(64, 36)
  strokeLine(buf, 3, 3, 60, 30, { color: packColor('#e5484d'), size: 4, shape: 'round' })

  it('covers every raster/vector format and every JSON export format, with unique ids', () => {
    const ids = SIZE_TARGETS.map((t) => t.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const f of ['png', 'jpg', 'webp', 'svg']) expect(ids).toContain(f)
    for (const f of JSON_EXPORT_FORMATS) expect(ids).toContain(`json:${f.id}`)
  })

  it('measures JSON formats as the exact byte length of the exported file', async () => {
    for (const format of JSON_EXPORT_FORMATS) {
      const target = SIZE_TARGETS.find((t) => t.id === `json:${format.id}`)!
      expect((await target.measure(buf)).bytes).toBe(new TextEncoder().encode(format.serialize(buf)).length)
    }
  })

  it('measures SVG as the exact byte length of the exported file', async () => {
    const target = SIZE_TARGETS.find((t) => t.id === 'svg')!
    expect((await target.measure(buf)).bytes).toBe(new TextEncoder().encode(toSvg(buf)).length)
  })

  it('lossless formats (SVG, RLE JSON, Delta+RLE JSON) keep exactly the canvas colors', async () => {
    const painted = createBuffer(64, 36)
    for (const [c, x0, y0, x1, y1] of [
      ['#e5484d', 3, 3, 60, 30], ['#0091ff', 5, 30, 55, 4], ['#30a46c', 30, 0, 30, 35],
    ] as const)
      strokeLine(painted, x0, y0, x1, y1, { color: packColor(c), size: 3, shape: 'round' })
    const canvasColors = analyze(painted).colors.length
    expect(canvasColors).toBe(3)
    for (const id of ['svg', ...JSON_EXPORT_FORMATS.map((f) => `json:${f.id}`)]) {
      const target = SIZE_TARGETS.find((t) => t.id === id)!
      expect((await target.measure(painted)).colors, id).toBe(canvasColors)
    }
  })

  it('an empty canvas has no colors in lossless formats', async () => {
    for (const id of ['svg', 'json:rle', 'json:delta-rle']) {
      const target = SIZE_TARGETS.find((t) => t.id === id)!
      expect((await target.measure(createBuffer(16, 9))).colors, id).toBe(0)
    }
  })
})
