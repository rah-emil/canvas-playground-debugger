import { QUALITIES, RATIOS } from '../canvas/config'
import type { CanvasEditor } from '../hooks/useCanvasEditor'
import { Card } from './Card'

export function SettingsCard({ editor }: { editor: CanvasEditor }) {
  const { quality, ratio, changeResolution, reset } = editor

  return (
    <Card title="Canvas">
      <div className="field">
        <span>Quality</span>
        <select
          aria-label="Quality"
          value={quality}
          onChange={(e) => changeResolution(Number(e.target.value), ratio)}
        >
          {QUALITIES.map((q) => (
            <option key={q.value} value={q.value}>
              {q.label}
            </option>
          ))}
        </select>
      </div>

      <div className="field">
        <span>Aspect ratio</span>
        <div className="seg">
          {RATIOS.map((r) => (
            <button
              key={r.label}
              type="button"
              className={r.label === ratio.label ? 'active' : ''}
              onClick={() => changeResolution(quality, r)}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      <div className="seg">
        <button type="button" className="danger" onClick={reset}>
          Reset
        </button>
      </div>
    </Card>
  )
}
