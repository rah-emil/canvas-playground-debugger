export interface Quality {
  label: string
  /** Length of the canvas' shorter side in pixels. */
  value: number
}

export interface Ratio {
  label: string
  w: number
  h: number
}

export const QUALITIES: readonly Quality[] = [
  { label: '72p', value: 72 },
  { label: '144p', value: 144 },
  { label: '240p', value: 240 },
  { label: '360p', value: 360 },
  { label: '480p', value: 480 },
  { label: '720p', value: 720 },
  { label: '1080p', value: 1080 },
  { label: '2K (1440p)', value: 1440 },
  { label: '4K (2160p)', value: 2160 },
]

export const RATIOS: readonly Ratio[] = [
  { label: '21:9', w: 21, h: 9 },
  { label: '16:9', w: 16, h: 9 },
  { label: '4:3', w: 4, h: 3 },
  { label: '1:1', w: 1, h: 1 },
  { label: '3:4', w: 3, h: 4 },
  { label: '9:16', w: 9, h: 16 },
]

export const DEFAULT_QUALITY = QUALITIES[1]
export const DEFAULT_RATIO = RATIOS[1]

/** Quality = the shorter side, as in video: 1080p means 1920×1080 and 1080×1920. */
export function getSize(quality: number, ratio: Ratio) {
  const k = ratio.w / ratio.h
  return k >= 1
    ? { width: Math.round(quality * k), height: quality }
    : { width: quality, height: Math.round(quality / k) }
}

/** Which quality × aspect ratio combination produces exactly this size (if any). */
export function findPreset(width: number, height: number) {
  for (const quality of QUALITIES) {
    for (const ratio of RATIOS) {
      const size = getSize(quality.value, ratio)
      if (size.width === width && size.height === height) return { quality, ratio }
    }
  }
  return undefined
}
