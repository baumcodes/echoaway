import { useDemo } from '@echoaway/app'
import { AssistantActionCard, ConfirmationCard } from '@echoaway/ui'

/** Renders the assistant card that overlays the trip when the agent
 *  has a quote to show or has just confirmed a change. */
export function AssistantOverlay() {
  const demo = useDemo()
  const { assistant } = demo
  if (assistant.kind === 'suggesting') {
    return (
      <AssistantActionCard
        quote={assistant.quote}
        onConfirm={() => void demo.confirmSuggestion()}
        onReject={demo.rejectSuggestion}
      />
    )
  }
  if (assistant.kind === 'confirmed') {
    return <ConfirmationCard quote={assistant.quote} />
  }
  return null
}
