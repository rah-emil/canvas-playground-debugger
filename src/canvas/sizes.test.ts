import { describe, expect, it } from 'vitest'
import { toSvg } from './export'
import { JSON_EXPORT_FORMATS } from './formats'
import { createBuffer, packColor, strokeLine } from './pixels'
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
      expect(await target.measure(buf)).toBe(new TextEncoder().encode(format.serialize(buf)).length)
    }
  })

  it('measures SVG as the exact byte length of the exported file', async () => {
    const target = SIZE_TARGETS.find((t) => t.id === 'svg')!
    expect(await target.measure(buf)).toBe(new TextEncoder().encode(toSvg(buf)).length)
  })
})
