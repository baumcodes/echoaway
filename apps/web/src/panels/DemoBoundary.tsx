import { useDemo } from '@echoaway/app'
import type { ReactNode } from 'react'

/** Gates the demo on the initial trip fetch. Renders the loading or
 *  error placeholder until the trip is in hand, then hands off to its
 *  children. Keeps `App.tsx` free of fetch-status branching. */
export function DemoBoundary({ children }: { children: ReactNode }) {
  const { fetchStatus, fetchError, trip } = useDemo()

  if (fetchStatus === 'loading' && !trip) {
    return <CenterMsg>Loading demo trip…</CenterMsg>
  }
  if (fetchStatus === 'error' && !trip) {
    return (
      <CenterMsg>
        <div className="error-state">
          <div className="label">Backend unreachable</div>
          <div>{fetchError}</div>
          <div style={{ marginTop: 8 }}>
            Try <code>yarn dev:backend</code> in another terminal.
          </div>
        </div>
      </CenterMsg>
    )
  }
  if (!trip) return <CenterMsg>No trip.</CenterMsg>
  return <>{children}</>
}

function CenterMsg({ children }: { children: ReactNode }) {
  return <div className="center-msg">{children}</div>
}
