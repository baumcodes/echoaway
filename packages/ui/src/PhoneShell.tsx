import type { ReactNode } from 'react'

export type PhoneShellProps = {
  children: ReactNode
}

/** Phone-frame container so the web demo *feels* like a mobile product. */
export function PhoneShell({ children }: PhoneShellProps) {
  return (
    <div className="phone-shell">
      <div className="phone-notch" aria-hidden />
      <div className="phone-screen">{children}</div>
    </div>
  )
}
