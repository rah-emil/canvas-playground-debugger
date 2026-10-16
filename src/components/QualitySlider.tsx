import { MAX_LOSSY_QUALITY, MIN_LOSSY_QUALITY } from '../canvas/quality'

interface Props {
  quality: number
  onChange: (quality: number) => void
  /** Label and accessible name; every instance has its own so they can be told apart. */
  label: string
  valueTestId?: string
}

/** Compression level slider 1…100. The state is shared (kept in the editor): there can be several sliders. */
export function QualitySlider({ quality, onChange, label, valueTestId }: Props) {
  return (
    <label className="quality">
      <span>
        {label}: <b data-testid={valueTestId}>{quality}</b>
      </span>
      <small className="muted">Higher = better quality, larger file</small>
      <input
        type="range"
        aria-label={label}
        min={MIN_LOSSY_QUALITY}
        max={MAX_LOSSY_QUALITY}
        step={1}
        value={quality}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </label>
  )
}
