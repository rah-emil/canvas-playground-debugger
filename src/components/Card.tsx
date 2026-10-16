import { useId, type ReactNode } from 'react'

interface Props {
  title: string
  children: ReactNode
  className?: string
}

/** A sidebar block: a heading and a set of settings on one topic. */
export function Card({ title, children, className = '' }: Props) {
  const id = useId()
  return (
    <section className={`card ${className}`.trim()} aria-labelledby={id}>
      <h2 id={id}>{title}</h2>
      <div className="card-body">{children}</div>
    </section>
  )
}
