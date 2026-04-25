import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { DemoBookingCard } from './DemoBookingCard.js'

describe('DemoBookingCard', () => {
  const rows = [
    { label: 'Phone', value: '+49 151 1234 5678', hint: 'last 3 → 678' },
    { label: 'Email', value: 'demo@planaway.com' },
    { label: 'Booking reference', value: 'trip-demo-bcn' },
  ]

  it('renders a row per entry with the value visible', () => {
    render(<DemoBookingCard rows={rows} />)
    expect(screen.getByText('Phone')).toBeTruthy()
    expect(screen.getByText('+49 151 1234 5678')).toBeTruthy()
    expect(screen.getByText('Email')).toBeTruthy()
    expect(screen.getByText('demo@planaway.com')).toBeTruthy()
    expect(screen.getByText('trip-demo-bcn')).toBeTruthy()
    // Hint is shown when present.
    expect(screen.getByText('last 3 → 678')).toBeTruthy()
  })

  it('copies the value to the clipboard when a row is clicked', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    })
    render(<DemoBookingCard rows={rows} />)

    fireEvent.click(screen.getByText('+49 151 1234 5678').closest('button')!)
    expect(writeText).toHaveBeenCalledWith('+49 151 1234 5678')
    // "Copy" → "Copied" feedback toggles on.
    await waitFor(() =>
      expect(screen.getAllByText('Copied').length).toBeGreaterThan(0),
    )
  })

  it('survives missing clipboard permission silently', () => {
    Object.defineProperty(navigator, 'clipboard', {
      value: undefined,
      configurable: true,
    })
    render(<DemoBookingCard rows={rows} />)
    // Just shouldn't throw on click.
    fireEvent.click(screen.getByText('demo@planaway.com').closest('button')!)
  })
})
