import { useMemo, useState } from 'react'
import { BrushCard } from './components/BrushCard'
import { Collapsible } from './components/Collapsible'
import { DownloadCard } from './components/DownloadCard'
import { ExportSizes } from './components/ExportSizes'
import { ImportCard } from './components/ImportCard'
import { InfoPanel } from './components/InfoPanel'
import { SettingsCard } from './components/SettingsCard'
import { StatusBar } from './components/StatusBar'
import { analyze } from './canvas/stats'
import { useCanvasEditor } from './hooks/useCanvasEditor'
import './App.css'

function App() {
  const editor = useCanvasEditor()
  const [infoOpen, setInfoOpen] = useState(false)
  const [formatsOpen, setFormatsOpen] = useState(false)
  const { buffer, canvasProps, revision, notice, noticeKind, dragOver, dropProps } = editor
  const { lossyQuality, setLossyQuality } = editor

  return (
    <main className="app">
      <h1>Canvas playground</h1>

      {notice && <p className={`notice notice-${noticeKind}`}>{notice}</p>}

      <div className="workspace">
        <div className="canvas-area">
          <StatusBar editor={editor} />
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
        </div>

        <aside className="sidebar" aria-label="Settings">
          <SettingsCard editor={editor} />
          <BrushCard editor={editor} />
          <ImportCard editor={editor} />
          <DownloadCard editor={editor} />
        </aside>
      </div>

      <Collapsible
        title="Canvas info and colors"
        hint="painted pixels, colors, rgba"
        open={infoOpen}
        onToggle={() => setInfoOpen((v) => !v)}
      >
        <InfoPanel key={revision} buffer={buffer} />
      </Collapsible>

      <Collapsible
        title="Formats: file sizes and colors"
        hint="PNG, JPG, WEBP, SVG, AVIF, JSON"
        open={formatsOpen}
        onToggle={() => setFormatsOpen((v) => !v)}
      >
        <FormatsSection
          key={revision}
          buffer={buffer}
          quality={lossyQuality}
          onQualityChange={setLossyQuality}
        />
      </Collapsible>
    </main>
  )
}

/** The canvas color count is computed here so the formats block does not depend on the info block being open. */
function FormatsSection({
  buffer,
  quality,
  onQualityChange,
}: {
  buffer: Parameters<typeof analyze>[0]
  quality: number
  onQualityChange: (quality: number) => void
}) {
  const canvasColors = useMemo(() => analyze(buffer).colors.length, [buffer])
  return (
    <ExportSizes
      buffer={buffer}
      canvasColors={canvasColors}
      quality={quality}
      onQualityChange={onQualityChange}
    />
  )
}

export default App
