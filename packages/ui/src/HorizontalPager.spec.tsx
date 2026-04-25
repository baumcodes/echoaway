import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { HorizontalPager } from './HorizontalPager.js'

describe('HorizontalPager', () => {
  it('renders one slide per child', () => {
    render(
      <HorizontalPager>
        <div>flight</div>
        <div>hotel</div>
        <div>transfer</div>
      </HorizontalPager>,
    )
    expect(screen.getAllByRole('group')).toHaveLength(3)
    expect(screen.getByRole('region')).toBeTruthy()
  })

  it('renders one dot per slide and marks the first active by default', () => {
    render(
      <HorizontalPager>
        <div>a</div>
        <div>b</div>
        <div>c</div>
      </HorizontalPager>,
    )
    const dots = screen.getAllByRole('tab')
    expect(dots).toHaveLength(3)
    expect(dots[0]?.getAttribute('aria-selected')).toBe('true')
    expect(dots[1]?.getAttribute('aria-selected')).toBe('false')
  })

  it('clicking a dot scrolls the carousel to that page', () => {
    render(
      <HorizontalPager>
        <div>a</div>
        <div>b</div>
        <div>c</div>
      </HorizontalPager>,
    )
    const region = screen.getByRole('region')
    Object.defineProperty(region, 'clientWidth', {
      configurable: true,
      value: 320,
    })
    const scrollTo = vi.fn()
    region.scrollTo = scrollTo as unknown as typeof region.scrollTo

    const dots = screen.getAllByRole('tab')
    fireEvent.click(dots[2]!)
    expect(scrollTo).toHaveBeenCalledWith({ left: 640, behavior: 'smooth' })
  })

  it('drops the pager chrome when there is exactly one child', () => {
    render(
      <HorizontalPager>
        <div data-testid="only">solo</div>
      </HorizontalPager>,
    )
    expect(screen.getByTestId('only')).toBeTruthy()
    expect(screen.queryByRole('region')).toBeNull()
    expect(screen.queryAllByRole('tab')).toHaveLength(0)
  })

  it('renders nothing when given no children', () => {
    const { container } = render(<HorizontalPager>{null}</HorizontalPager>)
    expect(container.firstChild).toBeNull()
  })

  it('falsy children (e.g. conditional `&&`) are not counted as pages', () => {
    render(
      <HorizontalPager>
        <div>a</div>
        {false}
        {null}
        <div>b</div>
      </HorizontalPager>,
    )
    expect(screen.getAllByRole('group')).toHaveLength(2)
    expect(screen.getAllByRole('tab')).toHaveLength(2)
  })
})
