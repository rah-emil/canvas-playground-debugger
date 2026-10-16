import { useMemo } from 'react'
import type { PixelBuffer } from '../canvas/pixels'
import { analyze, listPixels } from '../canvas/stats'

const PIXEL_LIMIT = 500
const COLOR_LIMIT = 200

interface Props {
  buffer: PixelBuffer
}

// The buffer is mutated in place, so the parent remounts the panel (key) after every stroke.
export function InfoPanel({ buffer }: Props) {
  const stats = useMemo(() => analyze(buffer), [buffer])
  const pixels = useMemo(() => listPixels(buffer, PIXEL_LIMIT), [buffer])

  return (
    <div className="info">
      <dl className="summary">
        <dt>Size</dt>
        <dd>
          {stats.width}×{stats.height} ({stats.total.toLocaleString('en-US')} px)
        </dd>
        <dt>Painted</dt>
        <dd>
          {stats.painted.toLocaleString('en-US')} px ({(stats.coverage * 100).toFixed(2)}%)
        </dd>
        <dt>Empty</dt>
        <dd>{(stats.total - stats.painted).toLocaleString('en-US')} px</dd>
        <dt>Bounding box</dt>
        <dd>
          {stats.bbox
            ? `x ${stats.bbox.minX}…${stats.bbox.maxX}, y ${stats.bbox.minY}…${stats.bbox.maxY}`
            : '—'}
        </dd>
        <dt>Unique colors</dt>
        <dd>{stats.colors.length}</dd>
      </dl>

      <div className="tables">
        <div>
          <h3>Colors</h3>
          <div className="scroll">
            <table>
              <thead>
                <tr>
                  <th>Color</th>
                  <th>Pixels</th>
                  <th>Share</th>
                </tr>
              </thead>
              <tbody>
                {stats.colors.slice(0, COLOR_LIMIT).map((c) => (
                  <tr key={c.hex}>
                    <td>
                      <i className="swatch" style={{ background: c.hex }} />
                      <code>{c.hex}</code>
                    </td>
                    <td>{c.count.toLocaleString('en-US')}</td>
                    <td>{((c.count / stats.painted) * 100).toFixed(1)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {stats.colors.length > COLOR_LIMIT && (
            <p className="hint">
              Showing the first {COLOR_LIMIT} of {stats.colors.length}.
            </p>
          )}
        </div>

        <div>
          <h3>Pixels (rgba)</h3>
          <div className="scroll">
            <table>
              <thead>
                <tr>
                  <th>x</th>
                  <th>y</th>
                  <th>Color</th>
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
              ? `Showing the first ${PIXEL_LIMIT} of ${stats.painted.toLocaleString('en-US')} (row by row). The full list is in the JSON.`
              : stats.painted === 0
                ? 'The canvas is empty.'
                : 'Showing all painted pixels.'}
          </p>
        </div>
      </div>
    </div>
  )
}
