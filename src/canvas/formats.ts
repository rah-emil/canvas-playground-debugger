/**
 * JSON formats of the canvas state.
 *
 * 1) RLE JSON (`stateToJson` in stats.ts) — horizontal runs of one color, empty pixels are skipped:
 *    { width, height, painted, palette: ["#rrggbb"], rows: { "<y>": [[x, length, palette index], ...] } }
 *
 * 2) Delta + RLE JSON (`stateToDeltaJson`) — delta encoding followed by RLE:
 *    - the canvas is walked row by row (left to right, top to bottom) as one stream of width×height pixels;
 *    - a pixel is [r, g, b, a], an empty pixel is [0, 0, 0, 0], the "previous" one before the first is [0, 0, 0, 0];
 *    - a pixel's delta is its value minus the previous pixel's value in the stream (per channel);
 *    - equal consecutive deltas collapse into a run [count, dr, dg, db, da].
 *    { format: "delta-rle", version: 1, width, height, painted,
 *      scan: "row-major", predictor: "previous-pixel", runs: [[count, dr, dg, db, da], ...] }
 *    Decoding: walk the runs and accumulate the sum of deltas; the counts add up to width × height.
 *
 * `parseCanvasJson` reads both formats (including files exported earlier) and validates the input.
 */
import { createBuffer, packColor, type PixelBuffer } from './pixels'
import { stateToJson } from './stats'

export type CanvasJsonFormat = 'rle' | 'delta-rle'

export interface ParsedCanvas {
  buffer: PixelBuffer
  format: CanvasJsonFormat
}

/** Input limits: protection against files that would eat all the memory. */
export const MAX_SIDE = 16384
export const MAX_PIXELS = 40_000_000

const fail = (message: string): never => {
  throw new Error(message)
}

export function stateToDeltaJson(buf: PixelBuffer): string {
  const { width, height, data32 } = buf
  const total = width * height
  const runs: number[][] = []
  let painted = 0
  let pr = 0
  let pg = 0
  let pb = 0
  let pa = 0
  let cur: number[] | null = null

  for (let i = 0; i < total; i++) {
    const v = data32[i]
    let r = 0
    let g = 0
    let b = 0
    let a = 0
    if (v >>> 24 !== 0) {
      r = v & 255
      g = (v >>> 8) & 255
      b = (v >>> 16) & 255
      a = v >>> 24
      painted++
    }
    const dr = r - pr
    const dg = g - pg
    const db = b - pb
    const da = a - pa
    if (cur && cur[1] === dr && cur[2] === dg && cur[3] === db && cur[4] === da) {
      cur[0]++
    } else {
      cur = [1, dr, dg, db, da]
      runs.push(cur)
    }
    pr = r
    pg = g
    pb = b
    pa = a
  }

  return JSON.stringify({
    format: 'delta-rle',
    version: 1,
    width,
    height,
    painted,
    scan: 'row-major',
    predictor: 'previous-pixel',
    runs,
  })
}

export interface JsonExportFormat {
  id: CanvasJsonFormat
  label: string
  /** Added to the file name before `.json`. */
  fileSuffix: string
  serialize: (buf: PixelBuffer) => string
}

/** Registry of export formats: a new format is one more entry, the UI picks it up by itself. */
export const JSON_EXPORT_FORMATS: readonly JsonExportFormat[] = [
  // RLE keeps its original file name (canvas-WxH.json).
  { id: 'rle', label: 'RLE JSON', fileSuffix: '', serialize: stateToJson },
  { id: 'delta-rle', label: 'Delta+RLE JSON', fileSuffix: '.delta-rle', serialize: stateToDeltaJson },
]

export function jsonExportFilename(format: JsonExportFormat, buf: PixelBuffer): string {
  return `canvas-${buf.width}x${buf.height}${format.fileSuffix}.json`
}

type Obj = Record<string, unknown>

const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v)

function readSize(obj: Obj): { width: number; height: number } {
  const { width, height } = obj
  if (!Number.isInteger(width) || !Number.isInteger(height) || (width as number) < 1 || (height as number) < 1) {
    fail('Invalid width/height: integers ≥ 1 are required')
  }
  const w = width as number
  const h = height as number
  if (w > MAX_SIDE || h > MAX_SIDE || w * h > MAX_PIXELS) {
    fail(`Canvas ${w}×${h} is too large (max ${MAX_SIDE} per side and ${MAX_PIXELS.toLocaleString('en-US')} pixels)`)
  }
  return { width: w, height: h }
}

function parseRle(obj: Obj): PixelBuffer {
  const { width, height } = readSize(obj)
  const { palette, rows } = obj
  if (!Array.isArray(palette)) fail('RLE JSON: palette must be an array')
  if (!isObj(rows)) fail('RLE JSON: rows must be an object')

  const colors = (palette as unknown[]).map((c, i) => {
    if (typeof c !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(c)) {
      return fail(`RLE JSON: palette[${i}] is not a #rrggbb color`)
    }
    return packColor(c)
  })

  const buf = createBuffer(width, height)
  for (const [key, runs] of Object.entries(rows as Obj)) {
    const y = Number(key)
    if (!Number.isInteger(y) || y < 0 || y >= height) fail(`RLE JSON: row "${key}" is outside the canvas`)
    if (!Array.isArray(runs)) fail(`RLE JSON: rows["${key}"] must be an array of runs`)
    for (const run of runs as unknown[]) {
      if (!Array.isArray(run) || run.length !== 3 || !run.every(Number.isInteger)) {
        fail(`RLE JSON: a run in row ${y} must be [x, length, palette index]`)
      }
      const [x, length, idx] = run as number[]
      if (x < 0 || length < 1 || x + length > width) {
        fail(`RLE JSON: run [${x}, ${length}] in row ${y} goes beyond the width ${width}`)
      }
      if (idx < 0 || idx >= colors.length) fail(`RLE JSON: palette index ${idx} in row ${y} does not exist`)
      buf.data32.fill(colors[idx], y * width + x, y * width + x + length)
    }
  }
  return buf
}

function parseDelta(obj: Obj): PixelBuffer {
  if (obj.version !== undefined && obj.version !== 1) fail(`Delta+RLE: version ${String(obj.version)} is not supported`)
  if (obj.predictor !== undefined && obj.predictor !== 'previous-pixel') {
    fail(`Delta+RLE: predictor "${String(obj.predictor)}" is not supported`)
  }
  if (obj.scan !== undefined && obj.scan !== 'row-major') {
    fail(`Delta+RLE: scan order "${String(obj.scan)}" is not supported`)
  }
  const { width, height } = readSize(obj)
  if (!Array.isArray(obj.runs)) fail('Delta+RLE: runs must be an array')

  const total = width * height
  const buf = createBuffer(width, height)
  let idx = 0
  let r = 0
  let g = 0
  let b = 0
  let a = 0

  for (const [n, run] of (obj.runs as unknown[]).entries()) {
    if (!Array.isArray(run) || run.length !== 5 || !run.every(Number.isInteger)) {
      fail(`Delta+RLE: run #${n} must be [count, dr, dg, db, da] of integers`)
    }
    const [count, dr, dg, db, da] = run as number[]
    if (count < 1) fail(`Delta+RLE: run #${n} has count < 1`)
    if (idx + count > total) fail(`Delta+RLE: the runs contain more pixels than the canvas has (${total})`)

    const constant = (dr | dg | db | da) === 0
    for (let k = 0; k < count; k++) {
      if (!constant || k === 0) {
        r += dr
        g += dg
        b += db
        a += da
        if (r < 0 || r > 255 || g < 0 || g > 255 || b < 0 || b > 255 || a < 0 || a > 255) {
          fail(`Delta+RLE: a channel value left 0…255 at pixel #${idx + k}`)
        }
      }
      // The canvas does not store semi-transparency: alpha < 128 is empty, otherwise an opaque pixel.
      buf.data32[idx + k] = a >= 128 ? ((255 << 24) | (b << 16) | (g << 8) | r) >>> 0 : 0
    }
    idx += count
  }
  if (idx !== total) fail(`Delta+RLE: the runs cover ${idx} pixels, but ${total} are needed (${width}×${height})`)
  return buf
}

export function parseCanvasJson(text: string): ParsedCanvas {
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    return fail('The file is not valid JSON')
  }
  if (!isObj(data)) return fail('Expected a JSON object with the canvas state')

  if (data.format === 'delta-rle') return { buffer: parseDelta(data), format: 'delta-rle' }
  if (data.format !== undefined) return fail(`Unknown format "${String(data.format)}"`)
  // RLE JSON has no `format` field — detect it by its structure.
  if ('palette' in data && 'rows' in data) return { buffer: parseRle(data), format: 'rle' }
  return fail('Unknown format: expected RLE JSON (palette + rows) or Delta+RLE JSON (format: "delta-rle")')
}
