import { createContext, useContext, type ReactNode } from 'react'
import type { ApiClient } from './client.js'
import {
  type DemoController,
  useVoiceConciergeDemo,
} from './useVoiceConciergeDemo.js'

const DemoContext = createContext<DemoController | null>(null)

export type DemoProviderProps = {
  apiClient: ApiClient
  travelerPhone?: string
  children: ReactNode
}

/**
 * Owns the single instance of the demo controller for the whole tree.
 * Panels read state via `useDemo()` instead of accepting prop-drilled
 * trip/assistant slices, so `App.tsx` can stay a layout file.
 */
export function DemoProvider({
  apiClient,
  travelerPhone,
  children,
}: DemoProviderProps) {
  const controller = useVoiceConciergeDemo({ apiClient, travelerPhone })
  return (
    <DemoContext.Provider value={controller}>{children}</DemoContext.Provider>
  )
}

export function useDemo(): DemoController {
  const ctx = useContext(DemoContext)
  if (!ctx) {
    throw new Error('useDemo() must be used inside <DemoProvider>')
  }
  return ctx
}
