import { describe, expect, it } from 'vitest'
import { findPreset } from './config'
import { JSON_EXPORT_FORMATS, jsonExportFilename, parseCanvasJson, stateToDeltaJson } from './formats'
import { placeCentered } from './import'
import { createBuffer, packColor, strokeLine, type PixelBuffer } from './pixels'
import { stateToJson } from './stats'

const RED = packColor('#ff0000')

function drawing(width = 40, height = 30): PixelBuffer {
  const buf = createBuffer(width, height)
  const strokes: [string, number, number, number, number, number][] = [
    ['#e5484d', 2, 3, 30, 25, 3],
    ['#0091ff', 5, 28, 35, 4, 2],
    ['#30a46c', 20, 0, 20, 29, 1],
    ['#e5484d', 0, 0, 0, 0, 1],
  ]
  for (const [c, x0, y0, x1, y1, size] of strokes)
    strokeLine(buf, x0, y0, x1, y1, { color: packColor(c), size, shape: 'round' })
  return buf
}

const same = (a: PixelBuffer, b: PixelBuffer) =>
  a.width === b.width && a.height === b.height && a.data32.every((v, i) => v === b.data32[i])

describe('stateToDeltaJson', () => {
  it('encodes a tiny canvas as run-length encoded neighbor deltas', () => {
    const buf = createBuffer(4, 1)
    buf.data32[1] = RED
    buf.data32[2] = RED
    const json = JSON.parse(stateToDeltaJson(buf))
    expect(json).toEqual({
      format: 'delta-rle',
      version: 1,
      width: 4,
      height: 1,
      painted: 2,
      scan: 'row-major',
      predictor: 'previous-pixel',
      runs: [
        [1, 0, 0, 0, 0], // пусто (то же, что «перед первым»)
        [1, 255, 0, 0, 255], // появился красный
        [1, 0, 0, 0, 0], // тот же красный
        [1, -255, 0, 0, -255], // вернулись к пустому
      ],
    })
  })

  it('merges equal consecutive deltas, including across row boundaries', () => {
    const empty = JSON.parse(stateToDeltaJson(createBuffer(5, 4)))
    expect(empty.runs).toEqual([[20, 0, 0, 0, 0]])
    expect(empty.painted).toBe(0)

    const full = createBuffer(3, 2)
    full.data32.fill(RED)
    expect(JSON.parse(stateToDeltaJson(full)).runs).toEqual([
      [1, 255, 0, 0, 255],
      [5, 0, 0, 0, 0],
    ])
  })

  it('turns a linear gradient into a single run', () => {
    const buf = createBuffer(5, 1)
    for (let i = 0; i < 5; i++) buf.data32[i] = packColor(`#${(10 + i * 10).toString(16).padStart(2, '0')}0000`)
    // первый пиксель (10,0,0,255) относительно пустого, дальше +10 по красному четыре раза
    expect(JSON.parse(stateToDeltaJson(buf)).runs).toEqual([
      [1, 10, 0, 0, 255],
      [4, 10, 0, 0, 0],
    ])
  })

  it('counts exactly width × height pixels in runs', () => {
    const json = JSON.parse(stateToDeltaJson(drawing()))
    const sum = json.runs.reduce((s: number, r: number[]) => s + r[0], 0)
    expect(sum).toBe(40 * 30)
  })
})

describe('parseCanvasJson — round trips', () => {
  it('RLE JSON: export -> import gives the same canvas', () => {
    const src = drawing()
    const { buffer, format } = parseCanvasJson(stateToJson(src))
    expect(format).toBe('rle')
    expect(same(buffer, src)).toBe(true)
  })

  it('Delta+RLE JSON: export -> import gives the same canvas', () => {
    const src = drawing()
    const { buffer, format } = parseCanvasJson(stateToDeltaJson(src))
    expect(format).toBe('delta-rle')
    expect(same(buffer, src)).toBe(true)
  })

  it('both formats agree on the same canvas', () => {
    const src = drawing(64, 36)
    expect(same(parseCanvasJson(stateToJson(src)).buffer, parseCanvasJson(stateToDeltaJson(src)).buffer)).toBe(true)
  })

  it('works for empty and fully painted canvases', () => {
    const empty = createBuffer(7, 5)
    const full = createBuffer(7, 5)
    full.data32.fill(RED)
    for (const src of [empty, full]) {
      expect(same(parseCanvasJson(stateToJson(src)).buffer, src)).toBe(true)
      expect(same(parseCanvasJson(stateToDeltaJson(src)).buffer, src)).toBe(true)
    }
  })

  it('reads an RLE JSON exported by an earlier version of the app', () => {
    // Формат без поля format — как выгружался раньше.
    const legacy = '{"width":10,"height":6,"painted":6,"palette":["#ff0000","#0000ff"],"rows":{"1":[[1,4,0]],"4":[[8,1,1]],"5":[[8,1,1]]}}'
    const { buffer, format } = parseCanvasJson(legacy)
    expect(format).toBe('rle')
    const expected = createBuffer(10, 6)
    expected.data32.fill(RED, 1 * 10 + 1, 1 * 10 + 5)
    expected.data32[4 * 10 + 8] = packColor('#0000ff')
    expected.data32[5 * 10 + 8] = packColor('#0000ff')
    expect(same(buffer, expected)).toBe(true)
  })

  it('handles a full-size 4K 21:9 canvas quickly', () => {
    const big = createBuffer(5040, 2160)
    strokeLine(big, 100, 100, 4900, 2000, { color: RED, size: 20, shape: 'square' })
    const t0 = performance.now()
    const { buffer } = parseCanvasJson(stateToDeltaJson(big))
    expect(same(buffer, big)).toBe(true)
    expect(performance.now() - t0).toBeLessThan(5000)
  })
})

describe('parseCanvasJson — validation', () => {
  const rle = (extra: object = {}) =>
    JSON.stringify({ width: 4, height: 2, palette: ['#ff0000'], rows: { 0: [[0, 2, 0]] }, ...extra })
  const delta = (extra: object = {}) =>
    JSON.stringify({ format: 'delta-rle', version: 1, width: 2, height: 2, runs: [[4, 0, 0, 0, 0]], ...extra })

  it.each([
    ['not json', 'это не json', 'не является корректным JSON'],
    ['array', '[]', 'JSON-объект'],
    ['null', 'null', 'JSON-объект'],
    ['unknown shape', '{"hello":1}', 'Неизвестный формат'],
    ['unknown format name', '{"format":"zip"}', 'Неизвестный формат "zip"'],
  ])('rejects %s', (_name, text, message) => {
    expect(() => parseCanvasJson(text)).toThrow(message)
  })

  it.each([
    ['zero width', rle({ width: 0 }), 'width/height'],
    ['fractional height', rle({ height: 2.5 }), 'width/height'],
    ['string width', rle({ width: '4' }), 'width/height'],
    ['huge canvas', rle({ width: 20000 }), 'слишком большой'],
    ['too many pixels', rle({ width: 10000, height: 10000 }), 'слишком большой'],
    ['palette not array', rle({ palette: 'x' }), 'palette'],
    ['bad palette color', rle({ palette: ['red'] }), 'palette[0]'],
    ['rows not object', rle({ rows: [] }), 'rows'],
    ['row out of canvas', rle({ rows: { 5: [[0, 1, 0]] } }), 'вне холста'],
    ['negative row', rle({ rows: { '-1': [[0, 1, 0]] } }), 'вне холста'],
    ['run wider than canvas', rle({ rows: { 0: [[3, 2, 0]] } }), 'выходит за ширину'],
    ['run with zero length', rle({ rows: { 0: [[0, 0, 0]] } }), 'выходит за ширину'],
    ['bad palette index', rle({ rows: { 0: [[0, 1, 3]] } }), 'не существует'],
    ['malformed run', rle({ rows: { 0: [[0, 1]] } }), 'должна быть [x, длина'],
  ])('RLE: rejects %s', (_name, text, message) => {
    expect(() => parseCanvasJson(text)).toThrow(message)
  })

  it.each([
    ['unknown version', delta({ version: 2 }), 'версия 2'],
    ['unknown predictor', delta({ predictor: 'up' }), 'предиктор'],
    ['unknown scan', delta({ scan: 'zigzag' }), 'порядок обхода'],
    ['runs not array', delta({ runs: {} }), 'runs'],
    ['malformed run', delta({ runs: [[4, 0, 0, 0]] }), 'серия #0'],
    ['fractional delta', delta({ runs: [[4, 0.5, 0, 0, 0]] }), 'серия #0'],
    ['zero count', delta({ runs: [[0, 0, 0, 0, 0], [4, 0, 0, 0, 0]] }), 'count < 1'],
    ['too many pixels', delta({ runs: [[5, 0, 0, 0, 0]] }), 'больше, чем пикселей'],
    ['too few pixels', delta({ runs: [[3, 0, 0, 0, 0]] }), 'покрывают 3 пикселей'],
    ['channel overflow', delta({ runs: [[1, 256, 0, 0, 255], [3, 0, 0, 0, 0]] }), 'вышло за 0…255'],
    ['channel underflow', delta({ runs: [[4, -1, 0, 0, 0]] }), 'вышло за 0…255'],
    ['overflow inside a long run', delta({ runs: [[1, 200, 0, 0, 255], [3, 30, 0, 0, 0]] }), 'вышло за 0…255'],
  ])('Delta+RLE: rejects %s', (_name, text, message) => {
    expect(() => parseCanvasJson(text)).toThrow(message)
  })

  it('Delta+RLE: alpha below 128 is empty, otherwise opaque', () => {
    const text = JSON.stringify({
      format: 'delta-rle',
      width: 3,
      height: 1,
      runs: [[1, 9, 9, 9, 100], [1, 0, 0, 0, 100], [1, 0, 0, 0, -200]],
    })
    const { buffer } = parseCanvasJson(text)
    expect(buffer.data32[0]).toBe(0) // alpha 100 — пусто
    expect(buffer.data32[1] >>> 24).toBe(255) // alpha 200 — закрашено
    expect(buffer.data32[2]).toBe(0) // alpha 0
  })
})

describe('findPreset', () => {
  it('maps sizes back to quality × ratio', () => {
    expect(findPreset(256, 144)).toMatchObject({ quality: { value: 144 }, ratio: { label: '16:9' } })
    expect(findPreset(5040, 2160)).toMatchObject({ quality: { value: 2160 }, ratio: { label: '21:9' } })
    expect(findPreset(1080, 1920)).toMatchObject({ quality: { value: 1080 }, ratio: { label: '9:16' } })
    expect(findPreset(300, 300)).toBeUndefined()
  })
})

describe('placeCentered', () => {
  it('puts a smaller canvas in the middle without scaling', () => {
    const src = createBuffer(2, 2)
    src.data32.fill(RED)
    const out = placeCentered(src, 6, 4)
    expect([...out.data32].filter(Boolean)).toHaveLength(4)
    expect(out.data32[1 * 6 + 2]).toBe(RED)
    expect(out.data32[2 * 6 + 3]).toBe(RED)
    expect(out.data32[0]).toBe(0)
  })

  it('crops a larger canvas around the center', () => {
    const src = createBuffer(10, 10)
    src.data32[5 * 10 + 5] = RED
    const out = placeCentered(src, 4, 4)
    // смещение (-3, -3): пиксель (5,5) -> (2,2)
    expect(out.data32[2 * 4 + 2]).toBe(RED)
    expect([...out.data32].filter(Boolean)).toHaveLength(1)
  })
})

describe('JSON_EXPORT_FORMATS registry', () => {
  it('has unique ids and file suffixes', () => {
    expect(new Set(JSON_EXPORT_FORMATS.map((f) => f.id)).size).toBe(JSON_EXPORT_FORMATS.length)
    expect(new Set(JSON_EXPORT_FORMATS.map((f) => f.fileSuffix)).size).toBe(JSON_EXPORT_FORMATS.length)
  })

  // Всё, что можно выгрузить, можно и загрузить обратно — это проверка для каждого будущего формата.
  it.each(JSON_EXPORT_FORMATS.map((f) => [f.id, f] as const))('%s: serialize -> parseCanvasJson round-trips', (id, format) => {
    const src = drawing()
    const parsed = parseCanvasJson(format.serialize(src))
    expect(parsed.format).toBe(id)
    expect(same(parsed.buffer, src)).toBe(true)
  })

  it('builds file names', () => {
    const buf = createBuffer(256, 144)
    expect(JSON_EXPORT_FORMATS.map((f) => jsonExportFilename(f, buf))).toEqual([
      'canvas-256x144.json',
      'canvas-256x144.delta-rle.json',
    ])
  })
})
