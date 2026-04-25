import { useMemo } from 'react'
import { createApiClient, DemoProvider } from '@echoaway/app'
import { DemoBoundary } from './panels/DemoBoundary.js'
import { PhoneStage } from './panels/PhoneStage.js'
import { SidePanel } from './panels/SidePanel.js'

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL ?? 'http://localhost:4000'

/**
 * Layout-only entry. All data, state, and orchestration live in
 * @echoaway/app via DemoProvider; panels self-serve via useDemo().
 */
export function App() {
  const apiClient = useMemo(
    () => createApiClient({ baseUrl: BACKEND_URL }),
    [],
  )
  return (
    <DemoProvider apiClient={apiClient}>
      <DemoBoundary>
        <div className="demo-shell">
          <SidePanel />
          <PhoneStage />
        </div>
      </DemoBoundary>
    </DemoProvider>
  )
}
