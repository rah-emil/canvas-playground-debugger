import { SIZE_TARGETS, formatBytes } from '../canvas/sizes'
import type { PixelBuffer } from '../canvas/pixels'
import { useExportSizes } from '../hooks/useExportSizes'
import { QualitySlider } from './QualitySlider'

interface Props {
  buffer: PixelBuffer
  /** How many unique colors the canvas itself has — every format is compared with it. */
  canvasColors: number
  /** Compression level 1…100 for JPG, WEBP and AVIF. */
  quality: number
  onQualityChange: (quality: number) => void
}

const fmt = (n: number) => n.toLocaleString('en-US')

export function ExportSizes({ buffer, canvasColors, quality, onQualityChange }: Props) {
  const sizes = useExportSizes(buffer, quality)

  const done = SIZE_TARGETS.flatMap((t) => {
    const s = sizes[t.id]
    return s.status === 'done' ? [s.bytes] : []
  })
  const max = Math.max(1, ...done)
  // Highlight the smallest one only when every format has been measured.
  const allDone = done.length === SIZE_TARGETS.length
  const min = Math.min(...done)

  return (
    <div className="export-sizes">
      <QualitySlider
        label="Compression level"
        quality={quality}
        onChange={onQualityChange}
        valueTestId="quality-value"
      />
      <div className="table-scroll">
      <table>
        <thead>
          <tr>
            <th scope="col">Format</th>
            <th scope="col">Size</th>
            <th scope="col">
              Colors <span className="muted">(on canvas: {fmt(canvasColors)})</span>
            </th>
            <th scope="col" aria-label="Size comparison" className="bar-col" />
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
                  {s.status === 'pending' && <span className="muted">calculating…</span>}
                  {s.status === 'error' && <span className="muted" title={s.message}>unavailable</span>}
                  {s.status === 'done' && (
                    <>
                      {formatBytes(s.bytes)}
                      {allDone && s.bytes === min && <em className="badge">smallest</em>}
                    </>
                  )}
                </td>
                <td className="colors" data-colors={s.status === 'done' ? (s.colors ?? undefined) : undefined}>
                  {s.status === 'pending' && <span className="muted">…</span>}
                  {s.status === 'error' && <span className="muted">—</span>}
                  {s.status === 'done' && s.colors === null && (
                    <span className="muted" title="Could not decode the file back">—</span>
                  )}
                  {s.status === 'done' && s.colors !== null && (
                    <>
                      {fmt(s.colors)}
                      {diff === 0 ? (
                        <em className="delta same">same as canvas</em>
                      ) : (
                        <em className="delta changed">
                          {diff! > 0 ? '+' : '−'}
                          {fmt(Math.abs(diff!))}
                        </em>
                      )}
                    </>
                  )}
                </td>
                <td className="bar-cell bar-col">
                  {s.status === 'done' && (
                    <div className="bar" style={{ width: `${Math.max(1, (s.bytes / max) * 100)}%` }} />
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
      </div>
      {SIZE_TARGETS.filter((t) => t.note).map((t) => (
        <p className="hint" key={t.id}>
          {t.note}
        </p>
      ))}
      <p className="hint">
        The sizes are exact: the canvas is encoded into every format but not downloaded. For PNG/JPG/WEBP
        the result depends on the browser's encoder. Colors are counted in the finished file (it is decoded
        back) and compared with the canvas: PNG, SVG and JSON keep them losslessly, while JPG/WEBP/AVIF are
        lossy and add shades that are not on the canvas; JPG also replaces transparency with a white background.
      </p>
    </div>
  )
}
