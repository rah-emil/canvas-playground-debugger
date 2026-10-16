import { useState } from 'react'
import type { CanvasJsonFormat } from './canvas/formats'
import { InfoPanel } from './components/InfoPanel'
import { Toolbar } from './components/Toolbar'
import { useCanvasEditor } from './hooks/useCanvasEditor'
import './App.css'

function App() {
  const editor = useCanvasEditor()
  const [infoOpen, setInfoOpen] = useState(false)
  const [jsonFormat, setJsonFormat] = useState<CanvasJsonFormat>('rle')
  const { buffer, canvasProps, revision, notice, noticeKind, dragOver, dropProps } = editor

  return (
    <main className="app">
      <h1>Canvas playground</h1>

      <Toolbar
        editor={editor}
        infoOpen={infoOpen}
        onToggleInfo={() => setInfoOpen((v) => !v)}
      />
      {notice && <p className={`notice ${noticeKind}`}>{notice}</p>}

      <div className={`stage${dragOver ? ' drag-over' : ''}`} {...dropProps}>
        <canvas
          {...canvasProps}
          className="canvas"
          style={{
            aspectRatio: `${buffer.width} / ${buffer.height}`,
            width: `min(100%, calc(68svh * ${buffer.width / buffer.height}))`,
          }}
        />
      </div>

      {infoOpen && (
        <InfoPanel
          key={revision}
          buffer={buffer}
          format={jsonFormat}
          onFormatChange={setJsonFormat}
        />
      )}
    </main>
  )
}

export default App
