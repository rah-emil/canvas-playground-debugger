import { SIZE_TARGETS, formatBytes } from '../canvas/sizes'
import type { PixelBuffer } from '../canvas/pixels'
import { useExportSizes } from '../hooks/useExportSizes'

interface Props {
  buffer: PixelBuffer
}

export function ExportSizes({ buffer }: Props) {
  const sizes = useExportSizes(buffer)

  const done = SIZE_TARGETS.flatMap((t) => {
    const s = sizes[t.id]
    return s.status === 'done' ? [s.bytes] : []
  })
  const max = Math.max(1, ...done)
  // Подсвечиваем самый маленький, только когда посчитаны все форматы.
  const allDone = done.length === SIZE_TARGETS.length
  const min = Math.min(...done)

  return (
    <div className="export-sizes">
      <h3>Размер файла по форматам</h3>
      <table>
        <tbody>
          {SIZE_TARGETS.map((t) => {
            const s = sizes[t.id]
            return (
              <tr key={t.id} data-format={t.id}>
                <th scope="row">{t.label}</th>
                <td className="bytes" data-bytes={s.status === 'done' ? s.bytes : undefined}>
                  {s.status === 'pending' && <span className="muted">считаю…</span>}
                  {s.status === 'error' && <span className="muted" title={s.message}>недоступно</span>}
                  {s.status === 'done' && (
                    <>
                      {formatBytes(s.bytes)}
                      {allDone && s.bytes === min && <em className="badge">минимум</em>}
                    </>
                  )}
                </td>
                <td className="bar-cell">
                  {s.status === 'done' && (
                    <div className="bar" style={{ width: `${Math.max(1, (s.bytes / max) * 100)}%` }} />
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
      <p className="hint">
        Точные размеры: холст кодируется в каждый формат, но не скачивается. Для PNG/JPG/WEBP
        результат зависит от кодировщика браузера.
      </p>
    </div>
  )
}
