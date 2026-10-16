import { useEffect, useState } from 'react'
import type { PixelBuffer } from '../canvas/pixels'
import { SIZE_TARGETS, type Measurement } from '../canvas/sizes'

export type SizeState =
  | { status: 'pending' }
  | ({ status: 'done' } & Measurement)
  | { status: 'error'; message: string }

const START_DELAY_MS = 150

const nextTask = () => new Promise<void>((resolve) => setTimeout(resolve, 0))

/**
 * Размеры холста во всех форматах экспорта. Считаются по очереди и с небольшой задержкой,
 * чтобы на больших холстах не подвешивать интерфейс, а при быстрых штрихах не считать зря.
 */
export function useExportSizes(buffer: PixelBuffer): Record<string, SizeState> {
  // Результаты привязаны к буферу, для которого посчитаны: у нового буфера всё снова «считается».
  const [result, setResult] = useState<{
    buffer: PixelBuffer | null
    sizes: Record<string, SizeState>
  }>({ buffer: null, sizes: {} })

  useEffect(() => {
    let cancelled = false
    const abort = new AbortController()
    const run = async () => {
      for (const target of SIZE_TARGETS) {
        await nextTask()
        if (cancelled) return
        let state: SizeState
        try {
          state = { status: 'done', ...(await target.measure(buffer, abort.signal)) }
        } catch (e) {
          state = { status: 'error', message: e instanceof Error ? e.message : String(e) }
        }
        if (cancelled) return
        setResult((prev) => ({
          buffer,
          sizes: { ...(prev.buffer === buffer ? prev.sizes : {}), [target.id]: state },
        }))
      }
    }
    const timer = setTimeout(run, START_DELAY_MS)
    return () => {
      cancelled = true
      abort.abort()
      clearTimeout(timer)
    }
  }, [buffer])

  const current = result.buffer === buffer ? result.sizes : {}
  return Object.fromEntries(
    SIZE_TARGETS.map((t) => [t.id, current[t.id] ?? { status: 'pending' as const }]),
  )
}
