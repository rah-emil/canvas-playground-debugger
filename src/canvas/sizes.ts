import { encodeAvifFile } from './avif'
import { countBlobColors } from './colors'
import { exportBlob, toSvg } from './export'
import { JSON_EXPORT_FORMATS, parseCanvasJson } from './formats'
import { DEFAULT_LOSSY_QUALITY } from './quality'
import type { PixelBuffer } from './pixels'
import { analyze } from './stats'

export interface Measurement {
  /** Exact file size in bytes: the canvas is really encoded into this format, but not downloaded. */
  bytes: number
  /** Unique colors in the finished file (after decoding it back); null — could not be counted. */
  colors: number | null
}

export interface MeasureOptions {
  /** Compression level 1…100; only affects lossy formats. */
  quality?: number
  signal?: AbortSignal
}

export interface SizeTarget {
  id: string
  label: string
  /** The size depends on the compression slider (JPG, WEBP, AVIF); the others are not recalculated when it moves. */
  lossy?: boolean
  measure: (buf: PixelBuffer, options?: MeasureOptions) => Promise<Measurement>
  /** An explanation when the size is measured in a special way or the format cannot be downloaded. */
  note?: string
}

/** Colors must not break the size measurement: if the file could not be decoded, we just do not show them. */
async function safeColors(count: () => Promise<number> | number): Promise<number | null> {
  try {
    return await count()
  } catch {
    return null
  }
}

async function measureRaster(
  buf: PixelBuffer,
  format: 'png' | 'jpg' | 'webp',
  quality: number,
): Promise<Measurement> {
  const blob = await exportBlob(buf, format, quality)
  return { bytes: blob.size, colors: await safeColors(() => countBlobColors(blob)) }
}

/** SVG consists of filled rectangles — its colors are the distinct fill values. */
function measureSvg(buf: PixelBuffer): Measurement {
  const svg = toSvg(buf)
  const fills = new Set(svg.match(/fill="#[0-9a-fA-F]{6}"/g))
  return { bytes: new Blob([svg]).size, colors: fills.size }
}

/** Every format the canvas can be exported to. JSON formats come from the registry, new ones appear on their own. */
export const SIZE_TARGETS: readonly SizeTarget[] = [
  { id: 'png', label: 'PNG', measure: (buf) => measureRaster(buf, 'png', DEFAULT_LOSSY_QUALITY) },
  {
    id: 'jpg',
    label: 'JPG',
    lossy: true,
    measure: (buf, { quality = DEFAULT_LOSSY_QUALITY } = {}) => measureRaster(buf, 'jpg', quality),
  },
  {
    id: 'webp',
    label: 'WEBP',
    lossy: true,
    measure: (buf, { quality = DEFAULT_LOSSY_QUALITY } = {}) => measureRaster(buf, 'webp', quality),
  },
  { id: 'svg', label: 'SVG', measure: async (buf) => measureSvg(buf) },
  {
    id: 'avif',
    label: 'AVIF',
    lossy: true,
    measure: async (buf, { quality = DEFAULT_LOSSY_QUALITY, signal } = {}) => {
      const file = await encodeAvifFile(buf, quality, signal)
      return {
        bytes: file.byteLength,
        colors: await safeColors(() => countBlobColors(new Blob([file], { type: 'image/avif' }))),
      }
    },
    note:
      'AVIF: browsers cannot encode it on their own, so the size is measured by a built-in WASM encoder ' +
      '(4:4:4 color, compression level from the slider; AVIF has its own quality scale). This is only a size ' +
      'estimate — downloading as AVIF is not implemented.',
  },
  ...JSON_EXPORT_FORMATS.map((format) => ({
    id: `json:${format.id}`,
    label: format.label,
    measure: async (buf: PixelBuffer): Promise<Measurement> => {
      const text = format.serialize(buf)
      // Colors come from the file read back by the very import that opens it later.
      return {
        bytes: new Blob([text]).size,
        colors: await safeColors(() => analyze(parseCanvasJson(text).buffer).colors.length),
      }
    },
  })),
]

export function formatBytes(bytes: number): string {
  const num = (n: number) => n.toLocaleString('en-US', { maximumFractionDigits: 1 })
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${num(bytes / 1024)} KB`
  return `${num(bytes / (1024 * 1024))} MB`
}
