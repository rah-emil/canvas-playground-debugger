import type { CanvasEditor } from '../hooks/useCanvasEditor'
import { Card } from './Card'

export function BrushCard({ editor }: { editor: CanvasEditor }) {
  const { color, setColor, brushSize, maxBrush, setBrushSize, shape, setShape } = editor

  return (
    <Card title="Brush">
      <div className="field">
        <span>Color</span>
        <div className="row">
          <input
            type="color"
            aria-label="Brush color"
            value={color}
            onChange={(e) => setColor(e.target.value)}
          />
          <code data-testid="brush-color">{color}</code>
        </div>
      </div>

      <div className="field">
        <span>Size: {brushSize}px</span>
        <input
          type="range"
          aria-label="Brush size"
          min={1}
          max={maxBrush}
          value={brushSize}
          onChange={(e) => setBrushSize(Number(e.target.value))}
        />
      </div>

      <div className="field">
        <span>Shape</span>
        <div className="seg">
          <button
            type="button"
            className={shape === 'square' ? 'active' : ''}
            onClick={() => setShape('square')}
          >
            Square
          </button>
          <button
            type="button"
            className={shape === 'round' ? 'active' : ''}
            onClick={() => setShape('round')}
          >
            Round
          </button>
        </div>
      </div>
    </Card>
  )
}
