/**
 * JSON-форматы состояния холста.
 *
 * 1) RLE JSON (`stateToJson` в stats.ts) — горизонтальные серии одного цвета, пустые пиксели пропускаются:
 *    { width, height, painted, palette: ["#rrggbb"], rows: { "<y>": [[x, длина, индекс в palette], ...] } }
 *
 * 2) Delta + RLE JSON (`stateToDeltaJson`) — дельта-кодирование с последующим RLE:
 *    - холст обходится построчно (слева направо, сверху вниз) как один поток из width×height пикселей;
 *    - пиксель = [r, g, b, a], пустой пиксель = [0, 0, 0, 0], «предыдущий» перед первым = [0, 0, 0, 0];
 *    - дельта пикселя = его значение − значение предыдущего пикселя потока (покомпонентно);
 *    - одинаковые подряд идущие дельты сворачиваются в серию [количество, dr, dg, db, da].
 *    { format: "delta-rle", version: 1, width, height, painted,
 *      scan: "row-major", predictor: "previous-pixel", runs: [[count, dr, dg, db, da], ...] }
 *    Восстановление: идём по сериям и накапливаем сумму дельт; сумма количеств = width × height.
 *
 * `parseCanvasJson` читает оба формата (в том числе файлы, выгруженные раньше) и валидирует вход.
 */
import { createBuffer, packColor, type PixelBuffer } from './pixels'
import { stateToJson } from './stats'

export type CanvasJsonFormat = 'rle' | 'delta-rle'

export interface ParsedCanvas {
  buffer: PixelBuffer
  format: CanvasJsonFormat
}

/** Ограничения на вход: защита от файлов, которые съедят всю память. */
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
  /** Добавляется к имени файла перед `.json`. */
  fileSuffix: string
  serialize: (buf: PixelBuffer) => string
}

/** Реестр форматов выгрузки: новый формат = ещё одна запись, интерфейс подхватит его сам. */
export const JSON_EXPORT_FORMATS: readonly JsonExportFormat[] = [
  // RLE оставлен с прежним именем файла (canvas-WxH.json).
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
    fail('Некорректные width/height: нужны целые числа ≥ 1')
  }
  const w = width as number
  const h = height as number
  if (w > MAX_SIDE || h > MAX_SIDE || w * h > MAX_PIXELS) {
    fail(`Холст ${w}×${h} слишком большой (максимум ${MAX_SIDE} по стороне и ${MAX_PIXELS.toLocaleString('ru')} пикселей)`)
  }
  return { width: w, height: h }
}

function parseRle(obj: Obj): PixelBuffer {
  const { width, height } = readSize(obj)
  const { palette, rows } = obj
  if (!Array.isArray(palette)) fail('RLE JSON: palette должен быть массивом')
  if (!isObj(rows)) fail('RLE JSON: rows должен быть объектом')

  const colors = (palette as unknown[]).map((c, i) => {
    if (typeof c !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(c)) {
      return fail(`RLE JSON: palette[${i}] — не цвет вида #rrggbb`)
    }
    return packColor(c)
  })

  const buf = createBuffer(width, height)
  for (const [key, runs] of Object.entries(rows as Obj)) {
    const y = Number(key)
    if (!Number.isInteger(y) || y < 0 || y >= height) fail(`RLE JSON: строка "${key}" вне холста`)
    if (!Array.isArray(runs)) fail(`RLE JSON: rows["${key}"] должен быть массивом серий`)
    for (const run of runs as unknown[]) {
      if (!Array.isArray(run) || run.length !== 3 || !run.every(Number.isInteger)) {
        fail(`RLE JSON: серия в строке ${y} должна быть [x, длина, индекс палитры]`)
      }
      const [x, length, idx] = run as number[]
      if (x < 0 || length < 1 || x + length > width) {
        fail(`RLE JSON: серия [${x}, ${length}] в строке ${y} выходит за ширину ${width}`)
      }
      if (idx < 0 || idx >= colors.length) fail(`RLE JSON: индекс палитры ${idx} в строке ${y} не существует`)
      buf.data32.fill(colors[idx], y * width + x, y * width + x + length)
    }
  }
  return buf
}

function parseDelta(obj: Obj): PixelBuffer {
  if (obj.version !== undefined && obj.version !== 1) fail(`Delta+RLE: версия ${String(obj.version)} не поддерживается`)
  if (obj.predictor !== undefined && obj.predictor !== 'previous-pixel') {
    fail(`Delta+RLE: предиктор "${String(obj.predictor)}" не поддерживается`)
  }
  if (obj.scan !== undefined && obj.scan !== 'row-major') {
    fail(`Delta+RLE: порядок обхода "${String(obj.scan)}" не поддерживается`)
  }
  const { width, height } = readSize(obj)
  if (!Array.isArray(obj.runs)) fail('Delta+RLE: runs должен быть массивом')

  const total = width * height
  const buf = createBuffer(width, height)
  let idx = 0
  let r = 0
  let g = 0
  let b = 0
  let a = 0

  for (const [n, run] of (obj.runs as unknown[]).entries()) {
    if (!Array.isArray(run) || run.length !== 5 || !run.every(Number.isInteger)) {
      fail(`Delta+RLE: серия #${n} должна быть [count, dr, dg, db, da] из целых чисел`)
    }
    const [count, dr, dg, db, da] = run as number[]
    if (count < 1) fail(`Delta+RLE: серия #${n} имеет count < 1`)
    if (idx + count > total) fail(`Delta+RLE: серий больше, чем пикселей (${total})`)

    const constant = (dr | dg | db | da) === 0
    for (let k = 0; k < count; k++) {
      if (!constant || k === 0) {
        r += dr
        g += dg
        b += db
        a += da
        if (r < 0 || r > 255 || g < 0 || g > 255 || b < 0 || b > 255 || a < 0 || a > 255) {
          fail(`Delta+RLE: значение канала вышло за 0…255 на пикселе #${idx + k}`)
        }
      }
      // Полупрозрачность холст не хранит: alpha < 128 — пусто, иначе — непрозрачный пиксель.
      buf.data32[idx + k] = a >= 128 ? ((255 << 24) | (b << 16) | (g << 8) | r) >>> 0 : 0
    }
    idx += count
  }
  if (idx !== total) fail(`Delta+RLE: серии покрывают ${idx} пикселей, а нужно ${total} (${width}×${height})`)
  return buf
}

export function parseCanvasJson(text: string): ParsedCanvas {
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    return fail('Файл не является корректным JSON')
  }
  if (!isObj(data)) return fail('Ожидался JSON-объект с состоянием холста')

  if (data.format === 'delta-rle') return { buffer: parseDelta(data), format: 'delta-rle' }
  if (data.format !== undefined) return fail(`Неизвестный формат "${String(data.format)}"`)
  // Формат RLE JSON не содержит поля format — определяем по структуре.
  if ('palette' in data && 'rows' in data) return { buffer: parseRle(data), format: 'rle' }
  return fail('Неизвестный формат: ожидался RLE JSON (palette + rows) или Delta+RLE JSON (format: "delta-rle")')
}
