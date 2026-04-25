import type { ReactNode } from 'react'

export type CardProps = {
  title?: string
  subtitle?: string
  accent?: 'default' | 'warning' | 'success' | 'info'
  /** When true, render the card as an accordion that toggles its body
   *  visibility on click. Uses native <details>/<summary> so it stays
   *  keyboard- and screen-reader accessible without extra state. */
  collapsible?: boolean
  /** Initial open state when `collapsible` is true. Default: open. */
  defaultOpen?: boolean
  /** Optional content rendered next to the title in the header (e.g.
   *  a small status pill). Pulled out as its own slot so collapsible
   *  cards can show a summary indicator without re-flowing the body. */
  headerExtra?: ReactNode
  children?: ReactNode
}

const accentClass = {
  default: 'card',
  warning: 'card card-accent-warning',
  success: 'card card-accent-success',
  info: 'card card-accent-info',
} as const

export function Card({
  title,
  subtitle,
  accent = 'default',
  collapsible = false,
  defaultOpen = true,
  headerExtra,
  children,
}: CardProps) {
  const className = accentClass[accent]
  const headerInner = (
    <>
      <div className="card-header-text">
        {title && <h3>{title}</h3>}
        {subtitle && <p className="card-subtitle">{subtitle}</p>}
      </div>
      {headerExtra && <div className="card-header-extra">{headerExtra}</div>}
    </>
  )

  if (collapsible) {
    return (
      <details className={`${className} card-collapsible`} open={defaultOpen}>
        <summary className="card-header card-summary">
          {headerInner}
          <span className="card-chevron" aria-hidden>
            ▾
          </span>
        </summary>
        <div className="card-body">{children}</div>
      </details>
    )
  }

  return (
    <section className={className}>
      {(title || subtitle || headerExtra) && (
        <header className="card-header">{headerInner}</header>
      )}
      <div className="card-body">{children}</div>
    </section>
  )
}
