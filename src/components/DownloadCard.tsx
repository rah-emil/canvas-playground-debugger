import { useState } from 'react'
import { downloadBlob, type ExportFormat } from '../canvas/export'
import {
  JSON_EXPORT_FORMATS,
  jsonExportFilename,
  type CanvasJsonFormat,
} from '../canvas/formats'
import type { CanvasEditor } from '../hooks/useCanvasEditor'
import { Card } from './Card'
import { QualitySlider } from './QualitySlider'

const IMAGE_FORMATS: ExportFormat[] = ['png', 'jpg', 'webp', 'svg']

export function DownloadCard({ editor }: { editor: CanvasEditor }) {
  const { buffer, exportAs, lossyQuality, setLossyQuality } = editor
  const [jsonFormat, setJsonFormat] = useState<CanvasJsonFormat>('rle')

  const downloadJson = () => {
    const selected = JSON_EXPORT_FORMATS.find((f) => f.id === jsonFormat) ?? JSON_EXPORT_FORMATS[0]
    downloadBlob(
      new Blob([selected.serialize(buffer)], { type: 'application/json' }),
      jsonExportFilename(selected, buffer),
    )
  }

  return (
    <Card title="Download">
      <div className="field">
        <span>Image</span>
        <div className="seg">
          {IMAGE_FORMATS.map((f) => (
            <button
              key={f}
              type="button"
              title={f === 'jpg' || f === 'webp' ? `Compression level: ${lossyQuality}` : undefined}
              onClick={() => exportAs(f)}
            >
              {f.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      <QualitySlider
        label="JPG & WEBP compression level"
        quality={lossyQuality}
        onChange={setLossyQuality}
        valueTestId="download-quality-value"
      />

      <div className="field">
        <span>Canvas data (JSON)</span>
        <div className="row">
          <select
            aria-label="Export format"
            value={jsonFormat}
            onChange={(e) => setJsonFormat(e.target.value as CanvasJsonFormat)}
          >
            {JSON_EXPORT_FORMATS.map((f) => (
              <option key={f.id} value={f.id}>
                {f.label}
              </option>
            ))}
          </select>
          <div className="seg">
            <button type="button" onClick={downloadJson}>
              Download
            </button>
          </div>
        </div>
      </div>
    </Card>
  )
}
