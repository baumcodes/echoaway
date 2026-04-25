import type { AssistantState } from '@echoaway/app'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { VoiceMicButton } from './VoiceMicButton.js'

const sampleQuote = {
  componentId: 'comp-stay',
  changeType: 'check_in_date' as const,
  oldValue: '2026-05-02',
  newValue: '2026-05-03',
  feeCents: 0,
  currency: 'EUR' as const,
  policySummary: 'Free until end of today',
  validUntil: '2026-04-25T23:59:00.000Z',
}

describe('VoiceMicButton', () => {
  it('renders an icon-only button (no visible label) and is keyboard-accessible', () => {
    render(
      <VoiceMicButton state={{ kind: 'idle' }} onClick={() => undefined} />,
    )
    const btn = screen.getByRole('button')
    // No text node — only the SVG icon.
    expect(btn.textContent).toBe('')
    expect(btn.querySelector('svg')).toBeTruthy()
    // Default aria-label is the idle CTA.
    expect(btn.getAttribute('aria-label')).toBe('Talk to Away')
    expect(btn.getAttribute('type')).toBe('button')
  })

  it('applies a state-specific class so CSS can animate per state', () => {
    const cases: AssistantState[] = [
      { kind: 'idle' },
      { kind: 'listening' },
      { kind: 'thinking' },
      { kind: 'suggesting', quote: sampleQuote },
      { kind: 'confirmed', quote: sampleQuote },
      { kind: 'rejected' },
      { kind: 'error', message: 'x' },
    ]
    for (const state of cases) {
      const { unmount } = render(
        <VoiceMicButton state={state} onClick={() => undefined} />,
      )
      const btn = screen.getByRole('button')
      expect(btn.className).toContain(`mic-btn-${state.kind}`)
      unmount()
    }
  })

  it('updates aria-label across states', () => {
    const { rerender } = render(
      <VoiceMicButton state={{ kind: 'idle' }} onClick={() => undefined} />,
    )
    expect(screen.getByRole('button').getAttribute('aria-label')).toBe(
      'Talk to Away',
    )
    rerender(
      <VoiceMicButton
        state={{ kind: 'listening' }}
        onClick={() => undefined}
      />,
    )
    expect(screen.getByRole('button').getAttribute('aria-label')).toBe(
      'Listening — tap to stop',
    )
  })

  it('respects an explicit aria-label override', () => {
    render(
      <VoiceMicButton
        state={{ kind: 'idle' }}
        onClick={() => undefined}
        ariaLabel="Custom"
      />,
    )
    expect(screen.getByRole('button').getAttribute('aria-label')).toBe('Custom')
  })

  it('forwards click events', () => {
    const onClick = vi.fn()
    render(<VoiceMicButton state={{ kind: 'idle' }} onClick={onClick} />)
    fireEvent.click(screen.getByRole('button'))
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('honours the disabled prop', () => {
    const onClick = vi.fn()
    render(
      <VoiceMicButton
        state={{ kind: 'idle' }}
        onClick={onClick}
        disabled
      />,
    )
    const btn = screen.getByRole('button') as HTMLButtonElement
    expect(btn.disabled).toBe(true)
    fireEvent.click(btn)
    expect(onClick).not.toHaveBeenCalled()
  })

  describe('suggesting state', () => {
    it('renders the "Awaiting confirmation" label and pending-dots icon', () => {
      render(
        <VoiceMicButton
          state={{ kind: 'suggesting', quote: sampleQuote }}
          onClick={() => undefined}
        />,
      )
      const btn = screen.getByRole('button')
      expect(btn.textContent).toBe('Awaiting confirmation')
      // pending-dots, not the wave icon
      expect(btn.querySelectorAll('.pending-dot').length).toBe(3)
      expect(btn.querySelector('.wave-bar')).toBeNull()
    })

    it('morphs into the wide pill class', () => {
      render(
        <VoiceMicButton
          state={{ kind: 'suggesting', quote: sampleQuote }}
          onClick={() => undefined}
        />,
      )
      const btn = screen.getByRole('button')
      expect(btn.className).toContain('mic-btn-wide')
    })

    it('aria-label communicates the cancel affordance', () => {
      render(
        <VoiceMicButton
          state={{ kind: 'suggesting', quote: sampleQuote }}
          onClick={() => undefined}
        />,
      )
      expect(
        screen.getByRole('button').getAttribute('aria-label'),
      ).toBe('Awaiting confirmation — tap to cancel')
    })

    it('still forwards clicks (consumer routes to reject)', () => {
      const onClick = vi.fn()
      render(
        <VoiceMicButton
          state={{ kind: 'suggesting', quote: sampleQuote }}
          onClick={onClick}
        />,
      )
      fireEvent.click(screen.getByRole('button'))
      expect(onClick).toHaveBeenCalledTimes(1)
    })
  })
})
