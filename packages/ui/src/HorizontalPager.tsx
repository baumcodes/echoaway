import {
  Children,
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react'

export type HorizontalPagerProps = {
  children: ReactNode
  /** Used as the `aria-label` on the scroller. */
  ariaLabel?: string
  /** Hide the dot indicator (useful when the pager has 1 page). */
  showDots?: boolean
}

/**
 * Native scroll-snap carousel. Children are laid out one-per-page
 * horizontally; the user swipes/scrolls between them. CSS does the
 * heavy lifting (`scroll-snap-type: x mandatory`); React only tracks
 * the active page so the dot indicator can highlight it and dot taps
 * can scroll to a target page.
 *
 * Dumb on purpose — no data awareness, no business logic. The
 * consumer decides what cards to slot in and in what order.
 */
export function HorizontalPager({
  children,
  ariaLabel = 'Itinerary cards',
  showDots = true,
}: HorizontalPagerProps) {
  // `Children.toArray` already filters out null, undefined, true, and false
  // — boolean shortcuts like `{cond && <Card />}` won't show up as ghost pages.
  const pages = Children.toArray(children)
  const scrollerRef = useRef<HTMLDivElement>(null)
  const [active, setActive] = useState(0)

  useEffect(() => {
    const el = scrollerRef.current
    if (!el) return
    let raf = 0
    const update = () => {
      raf = 0
      const w = el.clientWidth
      if (!w) return
      // Round to the nearest page; clamp to [0, pages-1] so the
      // overscroll glow on iOS doesn't trip the index past the end.
      const next = Math.max(
        0,
        Math.min(pages.length - 1, Math.round(el.scrollLeft / w)),
      )
      setActive(next)
    }
    const onScroll = () => {
      if (raf) return
      raf = requestAnimationFrame(update)
    }
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      el.removeEventListener('scroll', onScroll)
      if (raf) cancelAnimationFrame(raf)
    }
  }, [pages.length])

  const goTo = useCallback((i: number) => {
    const el = scrollerRef.current
    if (!el) return
    el.scrollTo({ left: i * el.clientWidth, behavior: 'smooth' })
  }, [])

  if (pages.length === 0) return null
  if (pages.length === 1) {
    // Don't waste pager chrome on a single child.
    return <>{pages[0]}</>
  }

  return (
    <div className="pager-wrap">
      <div
        ref={scrollerRef}
        className="pager"
        role="region"
        aria-label={ariaLabel}
        aria-roledescription="carousel"
      >
        {pages.map((page, i) => (
          <div
            // eslint-disable-next-line react/no-array-index-key
            key={i}
            className="pager-page"
            role="group"
            aria-roledescription="slide"
            aria-label={`Slide ${i + 1} of ${pages.length}`}
          >
            {page}
          </div>
        ))}
      </div>
      {showDots && (
        <div className="pager-dots" role="tablist">
          {pages.map((_, i) => (
            <button
              // eslint-disable-next-line react/no-array-index-key
              key={i}
              type="button"
              role="tab"
              aria-selected={active === i}
              aria-label={`Go to slide ${i + 1}`}
              className={
                active === i ? 'pager-dot pager-dot-active' : 'pager-dot'
              }
              onClick={() => goTo(i)}
            />
          ))}
        </div>
      )}
    </div>
  )
}
