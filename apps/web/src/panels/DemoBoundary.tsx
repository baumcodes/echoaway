import { useDemo } from '@echoaway/app'
import type { ReactNode } from 'react'

/**
 * Gates the demo on transient fetch states only.
 *
 * The "no trip yet" idle state is *normal* now — the web doesn't
 * eagerly fetch on mount; the user has to talk to the agent first.
 * That's not an error or a loading state, so we hand through to the
 * children (PhoneStage renders TripPlaceholder for that case).
 *
 * What we still gate on:
 *   - mid-fetch (after a trip_loaded event triggered getTripById and
 *     it hasn't resolved yet) → spinner
 *   - fetch error → backend-down message with the actual cause
 */
export function DemoBoundary({ children }: { children: ReactNode }) {
  const { fetchStatus, fetchError, trip } = useDemo()

  if (fetchStatus === 'loading' && !trip) {
    return <CenterMsg>Loading trip…</CenterMsg>
  }
  if (fetchStatus === 'error' && !trip) {
    return (
      <CenterMsg>
        <div className="error-state">
          <div className="label">Could not load trip</div>
          <div>{fetchError}</div>
          <div style={{ marginTop: 8 }}>
            Make sure <code>yarn dev:backend</code> is running.
          </div>
        </div>
      </CenterMsg>
    )
  }
  return <>{children}</>
}

function CenterMsg({ children }: { children: ReactNode }) {
  return <div className="center-msg">{children}</div>
}
