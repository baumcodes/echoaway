import type { ReactNode } from 'react'

export type CardProps = {
  title?: string
  subtitle?: string
  accent?: 'default' | 'warning' | 'success' | 'info'
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
  children,
}: CardProps) {
  return (
    <section className={accentClass[accent]}>
      {(title || subtitle) && (
        <header className="card-header">
          {title && <h3>{title}</h3>}
          {subtitle && <p className="card-subtitle">{subtitle}</p>}
        </header>
      )}
      <div className="card-body">{children}</div>
    </section>
  )
}
