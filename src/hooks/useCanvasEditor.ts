import {
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
  type PointerEvent,
} from 'react'
import {
  DEFAULT_QUALITY,
  DEFAULT_RATIO,
  RATIOS,
  findPreset,
  getSize,
  type Ratio,
} from '../canvas/config'
import { downloadBlob, exportBlob, type ExportFormat } from '../canvas/export'
import { DEFAULT_LOSSY_QUALITY } from '../canvas/quality'
import { parseCanvasJson } from '../canvas/formats'
import {
  closestRatio,
  importImage,
  placeCentered,
  readImageSize,
  type FitMode,
} from '../canvas/import'
import {
  createBuffer,
  packColor,
  resample,
  strokeLine,
  type Brush,
  type BrushShape,
  type PixelBuffer,
} from '../canvas/pixels'

interface Point {
  x: number
  y: number
}

interface Notice {
  text: string
  kind: 'error' | 'info'
}

const errorNotice = (e: unknown): Notice => ({
  text: e instanceof Error ? e.message : String(e),
  kind: 'error',
})

/** JSON by type/extension, and when those are missing (no extension, renamed file) — by the first character. */
async function isJsonFile(file: File): Promise<boolean> {
  if (file.type.startsWith('image/')) return false
  if (file.type === 'application/json' || file.name.toLowerCase().endsWith('.json')) return true
  return (await file.slice(0, 64).text()).trimStart().startsWith('{')
}

/** The maximum brush size depends on the canvas height: 1/4 of it, but not less than 8px. */
export function maxBrushSize(height: number): number {
  return Math.max(8, Math.round(height / 4))
}

function initialBuffer(): PixelBuffer {
  const { width, height } = getSize(DEFAULT_QUALITY.value, DEFAULT_RATIO)
  return createBuffer(width, height)
}

export function useCanvasEditor() {
  const [quality, setQuality] = useState(DEFAULT_QUALITY.value)
  const [ratio, setRatio] = useState<Ratio>(DEFAULT_RATIO)
  const [color, setColor] = useState('#e5484d')
  const [brushSize, setBrushSize] = useState(4)
  const [shape, setShape] = useState<BrushShape>('square')
  // The buffer is mutated in place while drawing; a new identity means a new size or a reset.
  const [buffer, setBuffer] = useState(initialBuffer)
  // Grows after every stroke — the canvas information is recalculated by it.
  const [revision, setRevision] = useState(0)
  const [hover, setHover] = useState<Point | null>(null)
  const [notice, setNotice] = useState<Notice | null>(null)
  const [fit, setFit] = useState<FitMode>('original')
  const [smooth, setSmooth] = useState(true)
  const [matchRatio, setMatchRatio] = useState(true)
  const [dragOver, setDragOver] = useState(false)
  // JPG/WEBP compression level: shared by downloads and by the size estimates in the formats block.
  const [lossyQuality, setLossyQuality] = useState(DEFAULT_LOSSY_QUALITY)

  const canvasRef = useRef<HTMLCanvasElement>(null)
  const lastPoint = useRef<Point | null>(null)

  // The chosen size is stored as is (so it comes back on a big canvas),
  // but we draw and show no more than the maximum allowed for the current canvas.
  const maxBrush = maxBrushSize(buffer.height)
  const effectiveBrushSize = Math.min(brushSize, maxBrush)

  const brush = useMemo<Brush>(
    () => ({ color: packColor(color), size: effectiveBrushSize, shape }),
    [color, effectiveBrushSize, shape],
  )

  useLayoutEffect(() => {
    canvasRef.current?.getContext('2d')?.putImageData(buffer.image, 0, 0)
  }, [buffer])

  const changeResolution = useCallback((nextQuality: number, nextRatio: Ratio) => {
    const { width, height } = getSize(nextQuality, nextRatio)
    setQuality(nextQuality)
    setRatio(nextRatio)
    setBuffer((prev) => resample(prev, width, height))
  }, [])

  const reset = useCallback(() => {
    setBuffer((prev) => createBuffer(prev.width, prev.height))
    setRevision((r) => r + 1)
  }, [])

  const exportAs = useCallback(
    async (format: ExportFormat) => {
      try {
        const blob = await exportBlob(buffer, format, lossyQuality)
        downloadBlob(blob, `canvas-${buffer.width}x${buffer.height}.${format}`)
        setNotice(null)
      } catch (e) {
        setNotice(errorNotice(e))
      }
    },
    [buffer, lossyQuality],
  )

  const importFile = useCallback(
    async (file: File) => {
      try {
        if (await isJsonFile(file)) {
          const { buffer: parsed } = parseCanvasJson(await file.text())
          const preset = findPreset(parsed.width, parsed.height)
          if (preset) {
            // The size from the file matches a preset — restore the canvas exactly.
            setQuality(preset.quality.value)
            setRatio(preset.ratio)
            setBuffer(parsed)
            setNotice(null)
          } else {
            const size = getSize(quality, ratio)
            setBuffer(placeCentered(parsed, size.width, size.height))
            setNotice({
              kind: 'info',
              text:
                `The canvas size in the file (${parsed.width}×${parsed.height}) matches none of the presets, ` +
                `so it was placed in the center of the current ${size.width}×${size.height} canvas without scaling.`,
            })
          }
          setRevision((r) => r + 1)
          return
        }
        if (!file.type.startsWith('image/')) throw new Error('Only images and canvas JSON files are supported')
        let nextRatio = ratio
        // In "Original" mode the canvas size stays what the user chose.
        if (matchRatio && fit !== 'original') {
          const { width, height } = await readImageSize(file)
          nextRatio = closestRatio(width, height, RATIOS)
        }
        const size = getSize(quality, nextRatio)
        const imported = await importImage(file, size.width, size.height, { fit, smooth })
        setRatio(nextRatio)
        setBuffer(imported)
        setRevision((r) => r + 1)
        setNotice(null)
      } catch (e) {
        setNotice(errorNotice(e))
      }
    },
    [fit, smooth, matchRatio, quality, ratio],
  )

  const dropProps = {
    onDragOver: (e: DragEvent<HTMLElement>) => {
      if (!e.dataTransfer.types.includes('Files')) return
      e.preventDefault()
      setDragOver(true)
    },
    onDragLeave: () => setDragOver(false),
    onDrop: (e: DragEvent<HTMLElement>) => {
      e.preventDefault()
      setDragOver(false)
      const file = e.dataTransfer.files[0]
      if (file) void importFile(file)
    },
  }

  const toPixel = (e: PointerEvent<HTMLCanvasElement>): Point => {
    const rect = e.currentTarget.getBoundingClientRect()
    const x = Math.floor(((e.clientX - rect.left) * buffer.width) / rect.width)
    const y = Math.floor(((e.clientY - rect.top) * buffer.height) / rect.height)
    return {
      x: Math.min(buffer.width - 1, Math.max(0, x)),
      y: Math.min(buffer.height - 1, Math.max(0, y)),
    }
  }

  const drawSegment = (from: Point, to: Point) => {
    const r = strokeLine(buffer, from.x, from.y, to.x, to.y, brush)
    canvasRef.current
      ?.getContext('2d')
      ?.putImageData(buffer.image, 0, 0, r.x, r.y, r.w, r.h)
  }

  const endStroke = () => {
    if (!lastPoint.current) return
    lastPoint.current = null
    setRevision((r) => r + 1)
  }

  const canvasProps = {
    ref: canvasRef,
    width: buffer.width,
    height: buffer.height,
    onPointerDown: (e: PointerEvent<HTMLCanvasElement>) => {
      if (e.button !== 0) return
      e.currentTarget.setPointerCapture(e.pointerId)
      const p = toPixel(e)
      lastPoint.current = p
      drawSegment(p, p)
    },
    onPointerMove: (e: PointerEvent<HTMLCanvasElement>) => {
      const p = toPixel(e)
      setHover((h) => (h && h.x === p.x && h.y === p.y ? h : p))
      if (lastPoint.current) {
        drawSegment(lastPoint.current, p)
        lastPoint.current = p
      }
    },
    onPointerUp: endStroke,
    onPointerCancel: endStroke,
    onPointerLeave: () => setHover(null),
  }

  return {
    quality,
    ratio,
    color,
    setColor,
    brushSize: effectiveBrushSize,
    maxBrush,
    setBrushSize,
    shape,
    setShape,
    buffer,
    revision,
    hover,
    notice: notice?.text ?? null,
    noticeKind: notice?.kind ?? 'error',
    changeResolution,
    reset,
    exportAs,
    lossyQuality,
    setLossyQuality,
    importFile,
    fit,
    setFit,
    smooth,
    setSmooth,
    matchRatio,
    setMatchRatio,
    dragOver,
    dropProps,
    canvasProps,
  }
}

export type CanvasEditor = ReturnType<typeof useCanvasEditor>
