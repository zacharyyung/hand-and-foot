import { useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { ActiveCardFlight } from '../game/cardFlight'
import { getAnchorPoint, prefersReducedCardMotion } from '../game/flightAnchors'
import type { AnchorPoint } from '../game/flightAnchors'
import { Card } from './Card'
import { CardFan } from './CardFan'

interface CardFlightLayerProps {
  flights: ActiveCardFlight[]
  onSettle: (flightId: string) => void
}

/** Decelerate only — no overshoot that reads as a landing bounce. */
const FLIGHT_EASING = 'cubic-bezier(0.33, 0, 0.2, 1)'

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

function FlyingCardContent({ flight }: { flight: ActiveCardFlight }) {
  if (flight.faceDown) {
    if (flight.cards.length > 1) {
      return <CardFan cards={flight.cards} small stacked faceDown />
    }
    return <Card faceDown small />
  }

  if (flight.cards.length > 1) {
    const spread = flight.kind === 'place'
    return <CardFan cards={flight.cards} small stacked={!spread} />
  }

  return <Card card={flight.cards[0]} small />
}

function FlyingCardStack({
  flight,
  onSettle,
}: {
  flight: ActiveCardFlight
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
    const rotLead = ROTATION_LEAD[flight.kind]

    const finishFlight = () => {
      if (cancelled || finished.current) return
      finished.current = true
      // Leave the element exactly where the transition ended — no transform snap.
      onSettleRef.current()
    }

    const runFlight = (from: AnchorPoint, to: AnchorPoint) => {
      const el = ref.current
      if (!el || cancelled) return

      const endRot = to.rotation ?? 0
      const startRot = endRot + rotLead

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
          node.style.transform = flightTransform(to.x, to.y, endRot)
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
      if (fallbackTimer) window.clearTimeout(fallbackTimer)
      if (transformEndHandler && ref.current) {
        ref.current.removeEventListener('transitionend', transformEndHandler)
      }
    }
  }, [flight.flightId, flight.from, flight.to, flight.kind, flight.duration, flight.delay])

  if (prefersReducedCardMotion()) return null

  return (
    <div
      ref={ref}
      className="card-flight-piece"
      style={{ opacity: visible ? 1 : 0 }}
      aria-hidden
    >
      <FlyingCardContent flight={flight} />
    </div>
  )
}

export function CardFlightLayer({ flights, onSettle }: CardFlightLayerProps) {
  if (flights.length === 0) return null

  return createPortal(
    <div className="pointer-events-none fixed inset-0 z-[200]" aria-hidden>
      {flights.map((flight) => (
        <FlyingCardStack
          key={flight.flightId}
          flight={flight}
          onSettle={() => onSettle(flight.flightId)}
        />
      ))}
    </div>,
    document.body,
  )
}
