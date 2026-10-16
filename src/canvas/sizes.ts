import { encodeAvifFile } from './avif'
import { countBlobColors } from './colors'
import { exportBlob, toSvg } from './export'
import { JSON_EXPORT_FORMATS, parseCanvasJson } from './formats'
import type { PixelBuffer } from './pixels'
import { analyze } from './stats'

export interface Measurement {
  /** Точный размер файла в байтах: холст реально кодируется в этот формат, но не скачивается. */
  bytes: number
  /** Уникальных цветов в готовом файле (после декодирования обратно); null — не удалось посчитать. */
  colors: number | null
}

export interface SizeTarget {
  id: string
  label: string
  measure: (buf: PixelBuffer, signal?: AbortSignal) => Promise<Measurement>
  /** Пояснение, если размер считается особым способом или формат недоступен для скачивания. */
  note?: string
}

/** Цвета не должны ронять измерение размера: если файл не декодировался, просто не показываем их. */
async function safeColors(count: () => Promise<number> | number): Promise<number | null> {
  try {
    return await count()
  } catch {
    return null
  }
}

async function measureRaster(buf: PixelBuffer, format: 'png' | 'jpg' | 'webp'): Promise<Measurement> {
  const blob = await exportBlob(buf, format)
  return { bytes: blob.size, colors: await safeColors(() => countBlobColors(blob)) }
}

/** SVG состоит из закрашенных прямоугольников — цвета это различные значения fill. */
function measureSvg(buf: PixelBuffer): Measurement {
  const svg = toSvg(buf)
  const fills = new Set(svg.match(/fill="#[0-9a-fA-F]{6}"/g))
  return { bytes: new Blob([svg]).size, colors: fills.size }
}

/** Все форматы, в которые можно выгрузить холст. JSON-форматы берутся из реестра, новые появятся сами. */
export const SIZE_TARGETS: readonly SizeTarget[] = [
  { id: 'png', label: 'PNG', measure: (buf) => measureRaster(buf, 'png') },
  { id: 'jpg', label: 'JPG', measure: (buf) => measureRaster(buf, 'jpg') },
  { id: 'webp', label: 'WEBP', measure: (buf) => measureRaster(buf, 'webp') },
  { id: 'svg', label: 'SVG', measure: async (buf) => measureSvg(buf) },
  {
    id: 'avif',
    label: 'AVIF',
    measure: async (buf, signal) => {
      const file = await encodeAvifFile(buf, signal)
      return {
        bytes: file.byteLength,
        colors: await safeColors(() => countBlobColors(new Blob([file], { type: 'image/avif' }))),
      }
    },
    note:
      'AVIF: браузер не умеет его кодировать сам, поэтому размер считает встроенный WASM-кодировщик ' +
      '(качество 90, цвет 4:4:4). Это только оценка размера — скачивание в AVIF не реализовано.',
  },
  ...JSON_EXPORT_FORMATS.map((format) => ({
    id: `json:${format.id}`,
    label: format.label,
    measure: async (buf: PixelBuffer): Promise<Measurement> => {
      const text = format.serialize(buf)
      // Цвета — из файла, прочитанного обратно тем же импортом, которым его потом открывают.
      return {
        bytes: new Blob([text]).size,
        colors: await safeColors(() => analyze(parseCanvasJson(text).buffer).colors.length),
      }
    },
  })),
]

export function formatBytes(bytes: number): string {
  const num = (n: number) => n.toLocaleString('ru', { maximumFractionDigits: 1 })
  if (bytes < 1024) return `${bytes} Б`
  if (bytes < 1024 * 1024) return `${num(bytes / 1024)} КБ`
  return `${num(bytes / (1024 * 1024))} МБ`
}
