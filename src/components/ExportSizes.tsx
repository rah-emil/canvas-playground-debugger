import { SIZE_TARGETS, formatBytes } from '../canvas/sizes'
import type { PixelBuffer } from '../canvas/pixels'
import { useExportSizes } from '../hooks/useExportSizes'

interface Props {
  buffer: PixelBuffer
  /** Сколько уникальных цветов на самом холсте — с этим сравнивается каждый формат. */
  canvasColors: number
}

const fmt = (n: number) => n.toLocaleString('ru')

export function ExportSizes({ buffer, canvasColors }: Props) {
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
      <h3>Размер файла и цвета по форматам</h3>
      <table>
        <thead>
          <tr>
            <th scope="col">Формат</th>
            <th scope="col">Размер</th>
            <th scope="col">
              Цветов <span className="muted">(на холсте: {fmt(canvasColors)})</span>
            </th>
            <th scope="col" aria-label="Сравнение размеров" />
          </tr>
        </thead>
        <tbody>
          {SIZE_TARGETS.map((t) => {
            const s = sizes[t.id]
            const diff = s.status === 'done' && s.colors !== null ? s.colors - canvasColors : null
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
                <td className="colors" data-colors={s.status === 'done' ? (s.colors ?? undefined) : undefined}>
                  {s.status === 'pending' && <span className="muted">…</span>}
                  {s.status === 'error' && <span className="muted">—</span>}
                  {s.status === 'done' && s.colors === null && (
                    <span className="muted" title="Не удалось декодировать файл обратно">—</span>
                  )}
                  {s.status === 'done' && s.colors !== null && (
                    <>
                      {fmt(s.colors)}
                      {diff === 0 ? (
                        <em className="delta same">как на холсте</em>
                      ) : (
                        <em className="delta changed">
                          {diff! > 0 ? '+' : '−'}
                          {fmt(Math.abs(diff!))}
                        </em>
                      )}
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
      {SIZE_TARGETS.filter((t) => t.note).map((t) => (
        <p className="hint" key={t.id}>
          {t.note}
        </p>
      ))}
      <p className="hint">
        Размеры точные: холст кодируется в каждый формат, но не скачивается. Для PNG/JPG/WEBP результат
        зависит от кодировщика браузера. Цвета считаются по готовому файлу (он декодируется обратно) и
        сравниваются с холстом: PNG, SVG и JSON хранят их без потерь, а JPG/WEBP/AVIF сжимают с потерями
        и добавляют оттенки, которых на холсте нет; JPG к тому же заменяет прозрачность белым фоном.
      </p>
    </div>
  )
}
