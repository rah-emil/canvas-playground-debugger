import { useMemo } from 'react'
import { downloadBlob } from '../canvas/export'
import {
  JSON_EXPORT_FORMATS,
  jsonExportFilename,
  type CanvasJsonFormat,
} from '../canvas/formats'
import type { PixelBuffer } from '../canvas/pixels'
import { analyze, listPixels } from '../canvas/stats'
import { ExportSizes } from './ExportSizes'

const PIXEL_LIMIT = 500
const COLOR_LIMIT = 200

interface Props {
  buffer: PixelBuffer
  format: CanvasJsonFormat
  onFormatChange: (format: CanvasJsonFormat) => void
}

// Буфер мутируется на месте, поэтому родитель перемонтирует панель (key) после каждого штриха.
// Поэтому выбранный формат хранится у родителя, а не здесь.
export function InfoPanel({ buffer, format, onFormatChange }: Props) {
  const stats = useMemo(() => analyze(buffer), [buffer])
  const pixels = useMemo(() => listPixels(buffer, PIXEL_LIMIT), [buffer])

  const download = () => {
    const selected = JSON_EXPORT_FORMATS.find((f) => f.id === format) ?? JSON_EXPORT_FORMATS[0]
    downloadBlob(
      new Blob([selected.serialize(buffer)], { type: 'application/json' }),
      jsonExportFilename(selected, buffer),
    )
  }

  return (
    <section className="info">
      <div className="info-head">
        <h2>Состояние холста</h2>
        <div className="info-actions">
          <select
            aria-label="Формат экспорта"
            value={format}
            onChange={(e) => onFormatChange(e.target.value as CanvasJsonFormat)}
          >
            {JSON_EXPORT_FORMATS.map((f) => (
              <option key={f.id} value={f.id}>
                {f.label}
              </option>
            ))}
          </select>
          <div className="seg">
            <button type="button" onClick={download}>
              Скачать
            </button>
          </div>
        </div>
      </div>

      <dl className="summary">
        <dt>Размер</dt>
        <dd>
          {stats.width}×{stats.height} ({stats.total.toLocaleString('ru')} px)
        </dd>
        <dt>Закрашено</dt>
        <dd>
          {stats.painted.toLocaleString('ru')} px ({(stats.coverage * 100).toFixed(2)}%)
        </dd>
        <dt>Пустых</dt>
        <dd>{(stats.total - stats.painted).toLocaleString('ru')} px</dd>
        <dt>Рамка рисунка</dt>
        <dd>
          {stats.bbox
            ? `x ${stats.bbox.minX}…${stats.bbox.maxX}, y ${stats.bbox.minY}…${stats.bbox.maxY}`
            : '—'}
        </dd>
        <dt>Уникальных цветов</dt>
        <dd>{stats.colors.length}</dd>
      </dl>

      <ExportSizes buffer={buffer} canvasColors={stats.colors.length} />

      <div className="tables">
        <div>
          <h3>Цвета</h3>
          <div className="scroll">
            <table>
              <thead>
                <tr>
                  <th>Цвет</th>
                  <th>Пикселей</th>
                  <th>Доля</th>
                </tr>
              </thead>
              <tbody>
                {stats.colors.slice(0, COLOR_LIMIT).map((c) => (
                  <tr key={c.hex}>
                    <td>
                      <i className="swatch" style={{ background: c.hex }} />
                      <code>{c.hex}</code>
                    </td>
                    <td>{c.count.toLocaleString('ru')}</td>
                    <td>{((c.count / stats.painted) * 100).toFixed(1)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {stats.colors.length > COLOR_LIMIT && (
            <p className="hint">
              Показаны первые {COLOR_LIMIT} из {stats.colors.length}.
            </p>
          )}
        </div>

        <div>
          <h3>Пиксели (rgba)</h3>
          <div className="scroll">
            <table>
              <thead>
                <tr>
                  <th>x</th>
                  <th>y</th>
                  <th>Цвет</th>
                  <th>r</th>
                  <th>g</th>
                  <th>b</th>
                  <th>a</th>
                </tr>
              </thead>
              <tbody>
                {pixels.map((p) => (
                  <tr key={`${p.x},${p.y}`}>
                    <td>{p.x}</td>
                    <td>{p.y}</td>
                    <td>
                      <i className="swatch" style={{ background: p.hex }} />
                      <code>{p.hex}</code>
                    </td>
                    <td>{p.r}</td>
                    <td>{p.g}</td>
                    <td>{p.b}</td>
                    <td>{p.a}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="hint">
            {stats.painted > PIXEL_LIMIT
              ? `Показаны первые ${PIXEL_LIMIT} из ${stats.painted.toLocaleString('ru')} (построчно). Полный список — в JSON.`
              : stats.painted === 0
                ? 'Холст пуст.'
                : 'Показаны все закрашенные пиксели.'}
          </p>
        </div>
      </div>
    </section>
  )
}
