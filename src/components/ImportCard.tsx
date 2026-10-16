import { useRef } from 'react'
import { FIT_MODES, type FitMode } from '../canvas/import'
import type { CanvasEditor } from '../hooks/useCanvasEditor'
import { Card } from './Card'

export function ImportCard({ editor }: { editor: CanvasEditor }) {
  const { importFile, fit, setFit, smooth, setSmooth, matchRatio, setMatchRatio } = editor
  const fileInput = useRef<HTMLInputElement>(null)

  return (
    <Card title="Import">
      <div className="seg">
        <button type="button" onClick={() => fileInput.current?.click()}>
          Upload…
        </button>
      </div>
      <div className="field">
        <span>Fit mode</span>
        <select
          aria-label="Fit mode"
          value={fit}
          onChange={(e) => setFit(e.target.value as FitMode)}
        >
          {FIT_MODES.map((m) => (
            <option key={m.value} value={m.value}>
              {m.label}
            </option>
          ))}
        </select>
      </div>
      <div className="row checks">
        <label>
          <input
            type="checkbox"
            checked={smooth}
            disabled={fit === 'original'}
            onChange={(e) => setSmooth(e.target.checked)}
          />
          Smoothing
        </label>
        <label>
          <input
            type="checkbox"
            checked={matchRatio}
            disabled={fit === 'original'}
            onChange={(e) => setMatchRatio(e.target.checked)}
          />
          Match aspect ratio
        </label>
      </div>
      <p className="hint">
        An image (PNG, JPG, WEBP, SVG…) or canvas JSON (RLE and Delta+RLE). You can also drop a
        file straight onto the canvas.
      </p>
      <input
        ref={fileInput}
        type="file"
        accept="image/*,.json,application/json"
        hidden
        data-testid="import-input"
        onChange={(e) => {
          const file = e.target.files?.[0]
          e.target.value = '' // so the same file can be uploaded again
          if (file) void importFile(file)
        }}
      />
    </Card>
  )
}
