import { useRef } from 'react'
import { QUALITIES, RATIOS } from '../canvas/config'
import type { ExportFormat } from '../canvas/export'
import { FIT_MODES, type FitMode } from '../canvas/import'
import { toHex } from '../canvas/pixels'
import type { CanvasEditor } from '../hooks/useCanvasEditor'

const FORMATS: ExportFormat[] = ['png', 'jpg', 'webp', 'svg']

interface Props {
  editor: CanvasEditor
  infoOpen: boolean
  onToggleInfo: () => void
}

export function Toolbar({ editor, infoOpen, onToggleInfo }: Props) {
  const {
    quality,
    ratio,
    color,
    setColor,
    brushSize,
    maxBrush,
    setBrushSize,
    shape,
    setShape,
    buffer,
    hover,
    changeResolution,
    reset,
    exportAs,
    importFile,
    fit,
    setFit,
    smooth,
    setSmooth,
    matchRatio,
    setMatchRatio,
  } = editor
  const fileInput = useRef<HTMLInputElement>(null)

  const hoverValue = hover ? buffer.data32[hover.y * buffer.width + hover.x] : 0

  return (
    <div className="toolbar">
      <div className="field">
        <span>Качество</span>
        <select
          aria-label="Качество"
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
        <span>Соотношение сторон</span>
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

      <div className="field">
        <span>Цвет кисти</span>
        <div className="row">
          <input
            type="color"
            value={color}
            onChange={(e) => setColor(e.target.value)}
          />
          <code>{color}</code>
        </div>
      </div>

      <div className="field">
        <span>Размер кисти: {brushSize}px</span>
        <input
          type="range"
          min={1}
          max={maxBrush}
          value={brushSize}
          onChange={(e) => setBrushSize(Number(e.target.value))}
        />
      </div>

      <div className="field">
        <span>Форма</span>
        <div className="seg">
          <button
            type="button"
            className={shape === 'square' ? 'active' : ''}
            onClick={() => setShape('square')}
          >
            Квадрат
          </button>
          <button
            type="button"
            className={shape === 'round' ? 'active' : ''}
            onClick={() => setShape('round')}
          >
            Круг
          </button>
        </div>
      </div>

      <div className="field">
        <span>Импорт картинки</span>
        <div className="row">
          <div className="seg">
            <button type="button" onClick={() => fileInput.current?.click()}>
              Загрузить…
            </button>
          </div>
          <select
            aria-label="Режим вписывания"
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
            Сглаживание
          </label>
          <label>
            <input
              type="checkbox"
              checked={matchRatio}
              disabled={fit === 'original'}
              onChange={(e) => setMatchRatio(e.target.checked)}
            />
            Подогнать пропорции
          </label>
        </div>
        <input
          ref={fileInput}
          type="file"
          accept="image/*"
          hidden
          data-testid="import-input"
          onChange={(e) => {
            const file = e.target.files?.[0]
            e.target.value = '' // чтобы тот же файл можно было загрузить повторно
            if (file) void importFile(file)
          }}
        />
      </div>

      <div className="field">
        <span>Скачать</span>
        <div className="seg">
          {FORMATS.map((f) => (
            <button key={f} type="button" onClick={() => exportAs(f)}>
              {f.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      <div className="field">
        <span>Холст</span>
        <div className="seg">
          <button type="button" className="danger" onClick={reset}>
            Сбросить
          </button>
          <button
            type="button"
            className={infoOpen ? 'active' : ''}
            onClick={onToggleInfo}
          >
            Информация
          </button>
        </div>
      </div>

      <div className="status">
        {buffer.width}×{buffer.height}
        {hover && (
          <>
            {' · '}x:{hover.x} y:{hover.y}{' · '}
            {hoverValue >>> 24 ? toHex(hoverValue) : 'пусто'}
          </>
        )}
      </div>
    </div>
  )
}
