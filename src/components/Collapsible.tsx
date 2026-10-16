import { useId, type ReactNode } from 'react'

interface Props {
  title: string
  /** A short note to the right of the title. */
  hint?: string
  open: boolean
  onToggle: () => void
  children: ReactNode
}

/** A full-width collapsible block. Its content is not created while it is closed (and nothing is calculated). */
export function Collapsible({ title, hint, open, onToggle, children }: Props) {
  const bodyId = useId()
  return (
    <section className="card collapsible">
      <h2>
        <button
          type="button"
          className="collapsible-toggle"
          aria-expanded={open}
          aria-controls={bodyId}
          onClick={onToggle}
        >
          <span className="chevron" aria-hidden="true">
            {open ? '▾' : '▸'}
          </span>
          <span>{title}</span>
          {hint && <span className="muted collapsible-hint">{hint}</span>}
        </button>
      </h2>
      <div id={bodyId} hidden={!open}>
        {open && children}
      </div>
    </section>
  )
}
