import { toHex } from '../canvas/pixels'
import type { CanvasEditor } from '../hooks/useCanvasEditor'

/** Canvas size and the pixel under the cursor. */
export function StatusBar({ editor }: { editor: CanvasEditor }) {
  const { buffer, hover } = editor
  const value = hover ? buffer.data32[hover.y * buffer.width + hover.x] : 0

  return (
    <div className="status">
      <strong>
        {buffer.width}×{buffer.height}
      </strong>
      {hover && (
        <>
          {' · '}x:{hover.x} y:{hover.y}
          {' · '}
          {value >>> 24 ? toHex(value) : 'empty'}
        </>
      )}
    </div>
  )
}
