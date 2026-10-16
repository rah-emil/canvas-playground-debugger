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
  getSize,
  type Ratio,
} from '../canvas/config'
import { downloadBlob, exportBlob, type ExportFormat } from '../canvas/export'
import {
  closestRatio,
  importImage,
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

/** Максимальный размер кисти зависит от высоты холста: 1/4 высоты, но не меньше 8px. */
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
  // Буфер мутируется на месте во время рисования; новая идентичность = новый размер или сброс.
  const [buffer, setBuffer] = useState(initialBuffer)
  // Растёт после каждого штриха — по нему пересчитывается информация по холсту.
  const [revision, setRevision] = useState(0)
  const [hover, setHover] = useState<Point | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [fit, setFit] = useState<FitMode>('original')
  const [smooth, setSmooth] = useState(true)
  const [matchRatio, setMatchRatio] = useState(true)
  const [dragOver, setDragOver] = useState(false)

  const canvasRef = useRef<HTMLCanvasElement>(null)
  const lastPoint = useRef<Point | null>(null)

  // Выбранный размер хранится как есть (чтобы вернуться к нему на большом холсте),
  // но рисуем и показываем не больше допустимого максимума текущего холста.
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
        const blob = await exportBlob(buffer, format)
        downloadBlob(blob, `canvas-${buffer.width}x${buffer.height}.${format}`)
        setNotice(null)
      } catch (e) {
        setNotice(e instanceof Error ? e.message : String(e))
      }
    },
    [buffer],
  )

  const importFile = useCallback(
    async (file: File) => {
      try {
        if (!file.type.startsWith('image/')) throw new Error('Это не изображение')
        let nextRatio = ratio
        // В режиме «Оригинал» размер холста остаётся таким, как выбрал пользователь.
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
        setNotice(e instanceof Error ? e.message : String(e))
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
    notice,
    changeResolution,
    reset,
    exportAs,
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
