import type { AudioIntelligenceMetric } from '@echoaway/app'
import { Card } from './Card.js'

export type AudioMetricCardProps = {
  metric: AudioIntelligenceMetric | null
  /** Shown when no metric is available yet (Phase 6 will populate). */
  placeholder?: string
}

const scenarioLabel: Record<AudioIntelligenceMetric['scenario'], string> = {
  clean: 'Studio',
  airport_noise: 'Airport noise',
  cafe_noise: 'Café noise',
  street_noise: 'Street noise',
}

export function AudioMetricCard({ metric, placeholder }: AudioMetricCardProps) {
  if (!metric) {
    return (
      <Card title="Audio intelligence" subtitle="Track-specific metric">
        <p className="audio-metric-placeholder">
          {placeholder ?? 'Pending — populated when a voice session ends.'}
        </p>
      </Card>
    )
  }

  return (
    <Card
      title="Audio intelligence"
      subtitle={scenarioLabel[metric.scenario]}
      accent="info"
    >
      <div className="audio-metric">
        <Row
          label="Transcript clarity"
          value={`${Math.round(metric.transcriptQuality * 100)}%`}
        />
        <Row
          label="Correct trip identified"
          value={metric.correctTripIdentified ? 'yes' : 'no'}
        />
        <Row
          label="Correct action suggested"
          value={metric.correctActionSuggested ? 'yes' : 'no'}
        />
        <Row
          label="Confirmation requested"
          value={metric.confirmationRequested ? 'yes' : 'no'}
        />
        <Row
          label="Task completed"
          value={metric.taskCompleted ? 'yes' : 'no'}
        />
        <Row label="Final score" value={`${metric.finalScore}/100`} strong />
      </div>
    </Card>
  )
}

function Row({
  label,
  value,
  strong,
}: {
  label: string
  value: string
  strong?: boolean
}) {
  return (
    <div className="audio-metric-row">
      <span className="audio-metric-label">{label}</span>
      <span className={strong ? 'audio-metric-value strong' : 'audio-metric-value'}>
        {value}
      </span>
    </div>
  )
}
