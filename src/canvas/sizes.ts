import { exportBlob } from './export'
import { JSON_EXPORT_FORMATS } from './formats'
import type { PixelBuffer } from './pixels'

export interface SizeTarget {
  id: string
  label: string
  /** Точный размер файла в байтах: холст реально кодируется в этот формат, но не скачивается. */
  measure: (buf: PixelBuffer) => Promise<number>
}

const IMAGE_FORMATS = ['png', 'jpg', 'webp', 'svg'] as const

/** Все форматы, в которые можно выгрузить холст. JSON-форматы берутся из реестра, новые появятся сами. */
export const SIZE_TARGETS: readonly SizeTarget[] = [
  ...IMAGE_FORMATS.map((format) => ({
    id: format,
    label: format.toUpperCase(),
    measure: async (buf: PixelBuffer) => (await exportBlob(buf, format)).size,
  })),
  ...JSON_EXPORT_FORMATS.map((format) => ({
    id: `json:${format.id}`,
    label: format.label,
    measure: async (buf: PixelBuffer) => new Blob([format.serialize(buf)]).size,
  })),
]

export function formatBytes(bytes: number): string {
  const num = (n: number) => n.toLocaleString('ru', { maximumFractionDigits: 1 })
  if (bytes < 1024) return `${bytes} Б`
  if (bytes < 1024 * 1024) return `${num(bytes / 1024)} КБ`
  return `${num(bytes / (1024 * 1024))} МБ`
}
