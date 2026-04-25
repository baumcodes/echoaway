import type { ApiClient } from './client.js'
import type { ToolContext } from './tools/index.js'

/**
 * Open a VoiceSession for a given trip. Returns a populated
 * ToolContext that the agent / script threads through every tool call.
 */
export async function openVoiceSession(
  apiClient: ApiClient,
  tripId: string,
): Promise<ToolContext> {
  const session = await apiClient.createVoiceSession({ tripId })
  return {
    apiClient,
    sessionId: session.id,
    tripId,
  }
}
