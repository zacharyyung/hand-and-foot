import { useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { ActiveCardFlight } from '../game/cardFlight'
import { getAnchorPoint, prefersReducedCardMotion } from '../game/flightAnchors'
import type { AnchorPoint } from '../game/flightAnchors'
import { bookFanFlightCenter } from './cardFanLayout'
import { Card } from './Card'
import { CardFan } from './CardFan'

interface CardFlightLayerProps {
  flights: ActiveCardFlight[]
  onSettle: (flightId: string) => void
  mobile?: boolean
}

/** Mobile flight card tier — matches destination at-rest size (BookMini / hand / piles). */
type FlightCardTier = 'small' | 'tiny' | 'micro'

function flightCardTier(flight: ActiveCardFlight, mobile: boolean): FlightCardTier {
  if (!mobile) return 'small'

  const target =
    typeof flight.to === 'string'
      ? flight.to
      : typeof flight.from === 'string'
        ? flight.from
        : ''

  if (target.startsWith('book-') || target.startsWith('staging-')) return 'micro'
  if (
    target.startsWith('hand-') ||
    target === 'stock' ||
    target === 'discard' ||
    target.startsWith('seat-')
  ) {
    return 'tiny'
  }

  return 'tiny'
}

function fanLayoutOptions(tier: FlightCardTier, stacked: boolean) {
  return {
    small: tier === 'small',
    tiny: tier === 'tiny',
    micro: tier === 'micro',
    stacked,
  }
}

/** Snappy deceleration — fast start, clean stop, no floaty glide. */
const FLIGHT_EASING = 'cubic-bezier(0.2, 0.8, 0.2, 1)'

const ROTATION_LEAD: Record<ActiveCardFlight['kind'], number> = {
  draw: -0.6,
  place: -1,
  discard: -1,
}

function anchorWaitAttempts(toName: ActiveCardFlight['to']): number {
  if (typeof toName !== 'string') return 4
  if (toName.startsWith('hand-') || toName.startsWith('staging-') || toName.startsWith('book-')) {
    return 16
  }
  return 6
}

function waitForAnchors(
  fromName: ActiveCardFlight['from'],
  toName: ActiveCardFlight['to'],
  maxAttempts: number,
  onReady: (from: AnchorPoint, to: AnchorPoint) => void,
  onFail: () => void,
) {
  let attempts = 0
  const tick = () => {
    const from = getAnchorPoint(fromName)
    const to = getAnchorPoint(toName)
    if (from && to) {
      onReady(from, to)
      return
    }
    if (attempts++ < maxAttempts) {
      requestAnimationFrame(tick)
    } else {
      onFail()
    }
  }
  requestAnimationFrame(tick)
}

function flightTransform(x: number, y: number, rotationDeg: number): string {
  return `translate3d(${x}px, ${y}px, 0) translate(-50%, -50%) rotate(${rotationDeg}deg)`
}

function isHandDrawTarget(to: ActiveCardFlight['to']): boolean {
  return typeof to === 'string' && to.startsWith('hand-')
}

/** Match FLIGHT_EASING — fast out, clean stop. */
function easeSnappy(t: number): number {
  return 1 - (1 - t) ** 3
}

function runHandDrawFlight(
  el: HTMLDivElement,
  from: AnchorPoint,
  toAnchor: ActiveCardFlight['to'],
  duration: number,
  delay: number,
  startRot: number,
  onComplete: () => void,
): () => void {
  let rafId = 0
  const startAt = performance.now() + delay

  const tick = (now: number) => {
    const elapsed = now - startAt
    if (elapsed < 0) {
      rafId = requestAnimationFrame(tick)
      return
    }

    const t = Math.min(1, elapsed / duration)
    const eased = easeSnappy(t)
    const to = getAnchorPoint(toAnchor)
    const endRot = to?.rotation ?? 0

    if (to) {
      const x = from.x + (to.x - from.x) * eased
      const y = from.y + (to.y - from.y) * eased
      const rot = startRot + (endRot - startRot) * eased
      el.style.transform = flightTransform(x, y, rot)

      if (t >= 1) {
        el.style.transform = flightTransform(to.x, to.y, endRot)
        onComplete()
        return
      }
    } else if (t >= 1) {
      onComplete()
      return
    }

    rafId = requestAnimationFrame(tick)
  }

  rafId = requestAnimationFrame(tick)
  return () => cancelAnimationFrame(rafId)
}

function resolveFlightTarget(
  flight: ActiveCardFlight,
  anchor: AnchorPoint,
  mobile: boolean,
): AnchorPoint {
  if (typeof flight.to !== 'string' || !flight.to.startsWith('book-')) {
    return anchor
  }

  const totalCards = flight.bookLayout?.totalCards ?? flight.cards.length
  const incomingCards = flight.bookLayout?.incomingCards ?? flight.cards.length
  const stacked =
    flight.bookLayout?.stacked ??
    (totalCards >= 7 && incomingCards >= totalCards)

  const el = document.querySelector(`[data-flight-anchor="${flight.to}"]`)
  const container = el?.parentElement
  if (!container) return anchor

  const rect = container.getBoundingClientRect()
  const tier = flightCardTier(flight, mobile)
  const target = bookFanFlightCenter(totalCards, incomingCards, fanLayoutOptions(tier, stacked))
  return {
    x: rect.left + target.x,
    y: rect.top + target.y,
    rotation: flight.cards.length > 1 ? 0 : target.rotation,
  }
}

function FlyingCardContent({
  flight,
  mobile,
}: {
  flight: ActiveCardFlight
  mobile: boolean
}) {
  const tier = flightCardTier(flight, mobile)
  const cardSize =
    tier === 'micro'
      ? { micro: true as const }
      : tier === 'tiny'
        ? { tiny: true as const }
        : { small: true as const }
  const fanSize =
    tier === 'micro'
      ? { micro: true as const }
      : tier === 'tiny'
        ? { tiny: true as const }
        : { small: true as const }

  if (flight.faceDown) {
    if (flight.cards.length > 1) {
      return <CardFan cards={flight.cards} {...fanSize} stacked faceDown />
    }
    return <Card faceDown {...cardSize} />
  }

  if (flight.cards.length > 1) {
    const spread = flight.kind === 'place'
    return <CardFan cards={flight.cards} {...fanSize} stacked={!spread} />
  }

  return <Card card={flight.cards[0]} {...cardSize} />
}

function FlyingCardStack({
  flight,
  mobile,
  onSettle,
}: {
  flight: ActiveCardFlight
  mobile: boolean
  onSettle: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(false)
  const finished = useRef(false)
  const onSettleRef = useRef(onSettle)
  onSettleRef.current = onSettle

  useLayoutEffect(() => {
    finished.current = false

    if (prefersReducedCardMotion()) {
      onSettleRef.current()
      return
    }

    let cancelled = false
    let fallbackTimer: number | undefined
    let transformEndHandler: ((event: TransitionEvent) => void) | undefined
    let cancelDrawFlight: (() => void) | undefined
    const rotLead = ROTATION_LEAD[flight.kind]
    const trackHandDraw =
      flight.kind === 'draw' && isHandDrawTarget(flight.to)

    const finishFlight = () => {
      if (cancelled || finished.current) return
      finished.current = true
      // Reveal destination slots before hiding the flyer to avoid a blank frame.
      onSettleRef.current()
      requestAnimationFrame(() => {
        if (cancelled) return
        const el = ref.current
        if (el) el.style.opacity = '0'
      })
    }

    const runFlight = (from: AnchorPoint, to: AnchorPoint) => {
      const el = ref.current
      if (!el || cancelled) return

      const resolvedTo = resolveFlightTarget(flight, to, mobile)
      const endRot =
        flight.kind === 'place' && flight.cards.length > 1 ? 0 : (resolvedTo.rotation ?? 0)
      const startRot = endRot + rotLead

      if (trackHandDraw) {
        el.style.transition = 'none'
        el.style.opacity = '1'
        el.style.transform = flightTransform(from.x, from.y, startRot)
        setVisible(true)

        cancelDrawFlight = runHandDrawFlight(
          el,
          from,
          flight.to,
          flight.duration,
          flight.delay,
          startRot,
          () => {
            if (fallbackTimer) window.clearTimeout(fallbackTimer)
            finishFlight()
          },
        )

        fallbackTimer = window.setTimeout(() => {
          cancelDrawFlight?.()
          finishFlight()
        }, flight.delay + flight.duration + 48)
        return
      }

      transformEndHandler = (event: TransitionEvent) => {
        if (event.target !== el || event.propertyName !== 'transform') return
        el.removeEventListener('transitionend', transformEndHandler!)
        if (fallbackTimer) window.clearTimeout(fallbackTimer)
        finishFlight()
      }

      el.style.transition = 'none'
      el.style.opacity = '1'
      el.style.transform = flightTransform(from.x, from.y, startRot)
      setVisible(true)

      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          if (cancelled || !ref.current || !transformEndHandler) return
          const node = ref.current
          node.addEventListener('transitionend', transformEndHandler)
          node.style.transition = `transform ${flight.duration}ms ${FLIGHT_EASING}`
          node.style.transitionDelay = `${flight.delay}ms`
          node.style.transform = flightTransform(resolvedTo.x, resolvedTo.y, endRot)
        })
      })

      fallbackTimer = window.setTimeout(() => {
        if (transformEndHandler) el.removeEventListener('transitionend', transformEndHandler)
        finishFlight()
      }, flight.delay + flight.duration + 32)
    }

    waitForAnchors(
      flight.from,
      flight.to,
      anchorWaitAttempts(flight.to),
      (from, to) => {
        const deferTarget =
          typeof flight.to === 'string' &&
          (flight.to.startsWith('hand-') ||
            flight.to.startsWith('staging-') ||
            flight.to.startsWith('book-'))
        const defer =
          deferTarget &&
          (flight.kind === 'draw' ||
            (flight.kind === 'place' &&
              (flight.to.startsWith('staging-') || flight.to.startsWith('book-'))))
        if (defer) {
          requestAnimationFrame(() => runFlight(from, to))
        } else {
          runFlight(from, to)
        }
      },
      () => {
        if (!cancelled) onSettleRef.current()
      },
    )

    return () => {
      cancelled = true
      cancelDrawFlight?.()
      if (fallbackTimer) window.clearTimeout(fallbackTimer)
      if (transformEndHandler && ref.current) {
        ref.current.removeEventListener('transitionend', transformEndHandler)
      }
    }
  }, [flight.flightId, flight.from, flight.to, flight.kind, flight.duration, flight.delay, mobile])

  if (prefersReducedCardMotion()) return null

  return (
    <div
      ref={ref}
      className={`card-flight-piece will-change-transform ${mobile ? 'card-flight-piece-mobile' : ''}`}
      style={{ opacity: visible ? 1 : 0 }}
      aria-hidden
    >
      <FlyingCardContent flight={flight} mobile={mobile} />
    </div>
  )
}

export function CardFlightLayer({ flights, onSettle, mobile = false }: CardFlightLayerProps) {
  if (flights.length === 0) return null

  return createPortal(
    <div className="pointer-events-none fixed inset-0 z-[200]" aria-hidden>
      {flights.map((flight) => (
        <FlyingCardStack
          key={flight.flightId}
          flight={flight}
          mobile={mobile}
          onSettle={() => onSettle(flight.flightId)}
        />
      ))}
    </div>,
    document.body,
  )
}
