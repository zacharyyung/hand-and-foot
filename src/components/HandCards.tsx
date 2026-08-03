import { useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import type { Card as CardType } from '../game/cards'
import type { CardMotionKind } from '../game/cardMotion'
import { reorderHandOrder } from '../game/handOrder'
import { HAND_LAYOUT_MS } from '../game/cardFlight'
import { playSound } from '../game/audio'
import { computeHandFanLayout } from './handFanLayout'
import { Card } from './Card'
import { AnimatedCardShell } from './AnimatedCardShell'

interface HandCardsProps {
  hand: CardType[]
  handOrder: string[]
  onReorder: (order: string[]) => void
  selectedIds: string[]
  onToggle: (cardId: string) => void
  /**
   * Long-press: select all of a class, or clear when that class is already fully selected.
   * Return value drives select vs deselect sound feedback.
   */
  onSelectRank?: (cardId: string) => 'selected' | 'cleared' | void
  canSelect?: boolean
  canDrag?: boolean
  /** Spread cards with gaps, centered — for the player hand dock. */
  spread?: boolean
  /** Tighter tiny cards and fan for phone-width layouts. */
  mobile?: boolean
  getCardMotion?: (cardId: string) => CardMotionKind | undefined
  onPlaceMotion?: (cardId: string) => void
  isCardHidden?: (cardId: string) => boolean
}

/** Snappy card motion — keep in sync with cardFlight / cardMotion. */
const CARD_MS = 220
/** Hold this long (while pressed) to select all of a class, or clear when fully selected. */
const LONG_PRESS_MS = 500
/** Finger/mouse jitter allowance before the hold is cancelled. */
const LONG_PRESS_MOVE_PX = 20

/** Active cards pop above board chrome and neighbor cards. */
const Z = {
  base: 1,
  selected: 40,
  hover: 60,
  drag: 100,
} as const

type CardSlotPhase = 'in-flight' | 'visible'

/** Stable hand list — order follows handOrder, orphans appended once. */
function buildDisplayCards(hand: CardType[], handOrder: string[]): CardType[] {
  const byId = new Map(hand.map((c) => [c.id, c]))
  const ordered = handOrder
    .map((id) => byId.get(id))
    .filter((c): c is CardType => c !== undefined)
  const orderedIds = new Set(handOrder)
  const orphans = hand.filter((c) => !orderedIds.has(c.id))
  return [...ordered, ...orphans]
}

export function HandCards({
  hand,
  handOrder,
  onReorder,
  selectedIds,
  onToggle,
  onSelectRank,
  canSelect = true,
  canDrag = true,
  spread = false,
  mobile = false,
  getCardMotion,
  onPlaceMotion,
  isCardHidden,
}: HandCardsProps) {
  const [dragCardId, setDragCardId] = useState<string | null>(null)
  const [dropCardId, setDropCardId] = useState<string | null>(null)
  const [hoverCardId, setHoverCardId] = useState<string | null>(null)
  /** Keep draw-spread timing until the fan finishes opening after the last in-flight card. */
  const [layoutSpreadHold, setLayoutSpreadHold] = useState(false)
  const spreadOuterRef = useRef<HTMLDivElement>(null)
  const [fitWidth, setFitWidth] = useState<number | null>(null)
  const longPressTimerRef = useRef<number | null>(null)
  const longPressFiredRef = useRef(false)
  const pointerStartRef = useRef<{ x: number; y: number; cardId: string } | null>(null)
  /** Card currently being held for select-all (visual charge feedback). */
  const [holdingCardId, setHoldingCardId] = useState<string | null>(null)
  /** Native HTML5 drag fights long-press on phones — only drag-reorder on desktop. */
  const allowDrag = canDrag && !mobile

  const displayCards = useMemo(
    () => buildDisplayCards(hand, handOrder),
    [hand, handOrder],
  )
  const n = displayCards.length

  const inFlightIds = useMemo(
    () => new Set(displayCards.filter((c) => isCardHidden?.(c.id)).map((c) => c.id)),
    [displayCards, isCardHidden],
  )
  const hasIncoming = inFlightIds.size > 0

  useLayoutEffect(() => {
    if (hasIncoming) {
      setLayoutSpreadHold(true)
      return
    }

    if (!layoutSpreadHold) return

    const holdMs = HAND_LAYOUT_MS + 32
    const timer = window.setTimeout(() => setLayoutSpreadHold(false), holdMs)
    return () => window.clearTimeout(timer)
  }, [hasIncoming, layoutSpreadHold])

  const layoutAnimating = hasIncoming || layoutSpreadHold
  const handSpreadMs = layoutAnimating ? HAND_LAYOUT_MS : CARD_MS

  const hoverIndex = hoverCardId
    ? displayCards.findIndex((c) => c.id === hoverCardId)
    : null
  const selectedFlags = displayCards.map((c) => selectedIds.includes(c.id))
  const fanOptions =
    fitWidth != null
      ? { mobile, maxWidth: fitWidth }
      : mobile
        ? { mobile: true }
        : undefined
  const fanLayout = computeHandFanLayout(n, selectedFlags, hoverIndex, fanOptions)
  /* Scale only as a last resort after spacing already tightened to the dock. */
  const rawScale =
    fitWidth != null && fanLayout.fanWidth > fitWidth
      ? fitWidth / fanLayout.fanWidth
      : 1
  const fitScale = Math.min(1, Math.max(0.82, rawScale))

  useLayoutEffect(() => {
    if (!spread) {
      setFitWidth(null)
      return
    }

    const scrollEl = spreadOuterRef.current?.parentElement
    if (!scrollEl) return

    const measure = () => {
      /*
       * Leave a little room for fan rotation overhang on the outer cards
       * so scaled/tight hands don't visually clip past the dock.
       */
      const rotPad = mobile ? 16 : 20
      setFitWidth(Math.max(120, scrollEl.clientWidth - rotPad * 2))
    }

    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(scrollEl)
    return () => observer.disconnect()
  }, [spread, mobile])

  function clearLongPressTimer() {
    if (longPressTimerRef.current != null) {
      window.clearTimeout(longPressTimerRef.current)
      longPressTimerRef.current = null
    }
  }

  function cancelHold() {
    clearLongPressTimer()
    pointerStartRef.current = null
    setHoldingCardId(null)
  }

  function slotPhase(cardId: string): CardSlotPhase {
    return isCardHidden?.(cardId) ? 'in-flight' : 'visible'
  }

  function handleDragStart(cardId: string) {
    cancelHold()
    longPressFiredRef.current = false
    if (!allowDrag) return
    setDragCardId(cardId)
    playSound('select')
  }

  function handleDragOver(e: React.DragEvent, cardId: string) {
    e.preventDefault()
    if (!allowDrag || dragCardId === null) return
    setDropCardId(cardId)
  }

  function handleDrop(targetCardId: string) {
    if (!allowDrag || dragCardId === null) return
    const dragIndex = displayCards.findIndex((c) => c.id === dragCardId)
    const dropIndex = displayCards.findIndex((c) => c.id === targetCardId)
    if (dragIndex < 0 || dropIndex < 0) return

    const ids = displayCards.map((c) => c.id)
    onReorder(reorderHandOrder(ids, dragIndex, dropIndex))
    setDragCardId(null)
    setDropCardId(null)
    onPlaceMotion?.(dragCardId)
    playSound('place')
  }

  function handleDragEnd() {
    setDragCardId(null)
    setDropCardId(null)
  }

  function handleToggle(cardId: string) {
    if (!canSelect) return
    const wasSelected = selectedIds.includes(cardId)
    onToggle(cardId)
    if (wasSelected && hoverCardId === cardId) {
      setHoverCardId(null)
    }
    playSound(wasSelected ? 'deselect' : 'select')
  }

  /** Fires while the finger/mouse is still down — a hold, not a click-on-release. */
  function fireHoldSelectAll(cardId: string) {
    if (!onSelectRank || !canSelect) return
    longPressFiredRef.current = true
    longPressTimerRef.current = null
    pointerStartRef.current = null
    setHoldingCardId(null)
    const result = onSelectRank(cardId)
    playSound(result === 'cleared' ? 'deselect' : 'select')
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      navigator.vibrate(14)
    }
  }

  function handlePointerDown(e: React.PointerEvent, cardId: string) {
    if (!canSelect || !onSelectRank || e.button !== 0) return
    longPressFiredRef.current = false
    pointerStartRef.current = { x: e.clientX, y: e.clientY, cardId }
    clearLongPressTimer()
    setHoldingCardId(cardId)
    try {
      e.currentTarget.setPointerCapture(e.pointerId)
    } catch {
      /* some browsers reject capture on buttons mid-gesture */
    }
    longPressTimerRef.current = window.setTimeout(() => {
      /* Only complete if this card is still the active hold. */
      if (pointerStartRef.current?.cardId === cardId) {
        fireHoldSelectAll(cardId)
      }
    }, LONG_PRESS_MS)
  }

  function handlePointerMove(e: React.PointerEvent) {
    const start = pointerStartRef.current
    if (!start || longPressTimerRef.current == null) return
    const dx = e.clientX - start.x
    const dy = e.clientY - start.y
    if (dx * dx + dy * dy > LONG_PRESS_MOVE_PX * LONG_PRESS_MOVE_PX) {
      cancelHold()
    }
  }

  function handlePointerEnd(e: React.PointerEvent) {
    /* Releasing early cancels select-all; a completed hold already cleared the timer. */
    if (longPressTimerRef.current != null) {
      cancelHold()
    } else {
      pointerStartRef.current = null
      setHoldingCardId(null)
    }
    try {
      if (e.currentTarget.hasPointerCapture?.(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId)
      }
    } catch {
      /* ignore */
    }
  }

  function handleCardClick(cardId: string) {
    /* Suppress the synthetic click that follows a completed hold. */
    if (longPressFiredRef.current) {
      longPressFiredRef.current = false
      return
    }
    handleToggle(cardId)
  }

  function renderCardShell(
    card: CardType,
    phase: CardSlotPhase,
    lifted: boolean,
  ) {
    const inFlight = phase === 'in-flight'
    return (
      <AnimatedCardShell
        motion={inFlight ? undefined : getCardMotion?.(card.id)}
        className={[
          'hand-card-at-rest hand-card-slot block',
          inFlight ? 'hand-card-slot--in-flight' : 'hand-card-slot--visible',
        ].join(' ')}
      >
        <Card card={card} small={!mobile} tiny={mobile} lifted={lifted} />
      </AnimatedCardShell>
    )
  }

  const pressHandlers = (cardId: string) =>
    onSelectRank
      ? {
          onPointerDown: (e: React.PointerEvent) => handlePointerDown(e, cardId),
          onPointerMove: handlePointerMove,
          onPointerUp: handlePointerEnd,
          onPointerCancel: handlePointerEnd,
          onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
        }
      : {}

  if (!spread) {
    return (
      <div className="flex flex-wrap justify-center gap-1.5 p-1 sm:justify-start">
        {displayCards.map((card) => {
          const isSelected = selectedIds.includes(card.id)
          const phase = slotPhase(card.id)
          const inFlight = phase === 'in-flight'
          return (
            <button
              key={card.id}
              type="button"
              onClick={() => handleCardClick(card.id)}
              disabled={!canSelect || inFlight}
              className={`will-change-transform shrink-0 transition-transform ease-snappy touch-manipulation ${
                isSelected
                  ? 'z-[60] -translate-y-3 scale-105'
                  : 'z-[1] hover:z-[60] hover:-translate-y-3 hover:scale-105'
              } ${holdingCardId === card.id ? 'hand-card-holding' : ''} ${
                inFlight ? 'pointer-events-none' : ''
              }`}
              style={
                {
                  transitionDuration: `${CARD_MS}ms`,
                  '--hand-hold-ms': `${LONG_PRESS_MS}ms`,
                } as CSSProperties
              }
              {...pressHandlers(card.id)}
            >
              {renderCardShell(card, phase, isSelected)}
            </button>
          )
        })}
      </div>
    )
  }

  return (
    <div
      ref={spreadOuterRef}
      className={`hand-cards-spread relative mx-auto flex w-full max-w-5xl justify-center overflow-x-clip px-1 sm:px-2 ${
        mobile ? 'hand-cards-spread-mobile' : ''
      }`}
      style={{
        minHeight: n > 0 ? (mobile ? '4.75rem' : 'min(6.25rem, 22dvh)') : undefined,
      }}
      onMouseLeave={() => setHoverCardId(null)}
    >
      <div
        className="relative flex max-w-full justify-center overflow-x-clip"
        style={{
          width: fitWidth != null ? fitWidth : '100%',
        }}
      >
        <div
          className="relative transition-[width,transform] ease-snappy will-change-[width,transform]"
          style={{
            width: fanLayout.fanWidth,
            height: mobile ? '4.5rem' : 'min(5.75rem, 21dvh)',
            transitionDuration: `${handSpreadMs}ms`,
            transform: fitScale < 1 ? `scale(${fitScale})` : undefined,
            transformOrigin: 'bottom center',
          }}
        >
        {displayCards.map((card, index) => {
          const slot = fanLayout.slots[index]
          const isSelected = selectedFlags[index]
          const isHovered = hoverCardId === card.id
          const isDragging = dragCardId === card.id
          const isDropTarget =
            dropCardId === card.id && dragCardId !== null && dragCardId !== card.id
          const phase = slotPhase(card.id)
          const inFlight = phase === 'in-flight'
          const lift = isSelected ? (mobile ? 10 : 16) : isHovered ? (mobile ? 8 : 12) : 0
          const isActive = isDragging || isHovered || isSelected

          let z = Z.base + index
          if (isDragging) z = Z.drag
          else if (isHovered) z = Z.hover
          else if (isSelected) z = Z.selected

          /*
           * Incoming draw slots snap to their final fan position immediately so
           * flight anchors stay stable. Visible neighbors animate to make space.
           */
          const slotTransition = inFlight
            ? 'none'
            : `transform ${handSpreadMs}ms cubic-bezier(0.2, 0.8, 0.2, 1), left ${handSpreadMs}ms cubic-bezier(0.2, 0.8, 0.2, 1), z-index 0ms`

          return (
            <div
              key={card.id}
              draggable={allowDrag && !inFlight}
              onDragStart={() => handleDragStart(card.id)}
              onDragOver={(e) => handleDragOver(e, card.id)}
              onDrop={() => handleDrop(card.id)}
              onDragEnd={handleDragEnd}
              onMouseEnter={() => setHoverCardId(card.id)}
              onMouseLeave={() => {
                if (hoverCardId === card.id) setHoverCardId(null)
              }}
              onFocus={() => setHoverCardId(card.id)}
              className={`absolute bottom-0 origin-bottom will-change-transform ${
                isDragging ? 'opacity-40' : ''
              } ${isDropTarget ? 'brightness-110' : ''} ${
                allowDrag && !inFlight
                  ? 'cursor-grab active:cursor-grabbing'
                  : 'cursor-default'
              } ${inFlight ? 'pointer-events-none' : ''}`}
              style={{
                left: slot.left,
                zIndex: z,
                transform: `translate3d(0, ${slot.arcY - lift}px, 0) rotate(${slot.rotation}deg)`,
                transition: slotTransition,
                touchAction: onSelectRank ? 'manipulation' : undefined,
                WebkitUserSelect: 'none',
                userSelect: 'none',
              }}
            >
              <span
                data-flight-anchor={`hand-${card.id}`}
                data-flight-rotation={slot.rotation}
                className="pointer-events-none absolute left-1/2 top-1/2 z-0 h-0 w-0 -translate-x-1/2 -translate-y-1/2"
                aria-hidden
              />
              <button
                type="button"
                onClick={() => handleCardClick(card.id)}
                disabled={!canSelect || inFlight}
                onBlur={() => {
                  if (hoverCardId === card.id) setHoverCardId(null)
                }}
                className={`relative block rounded-lg outline-none transition-transform ease-snappy will-change-transform touch-manipulation ${
                  isActive || holdingCardId === card.id ? 'scale-105' : 'scale-100'
                } ${
                  isSelected
                    ? 'ring-2 ring-accent ring-offset-2 ring-offset-felt-dark'
                    : canSelect
                      ? 'hover:brightness-[1.03]'
                      : ''
                } ${holdingCardId === card.id ? 'hand-card-holding' : ''}`}
                style={
                  {
                    transitionDuration: `${CARD_MS}ms`,
                    '--hand-hold-ms': `${LONG_PRESS_MS}ms`,
                  } as CSSProperties
                }
                draggable={false}
                aria-pressed={isSelected}
                aria-hidden={inFlight}
                title={
                  onSelectRank && canSelect
                    ? 'Tap to select · hold to select all of this kind · hold again when all are selected to clear'
                    : undefined
                }
                {...pressHandlers(card.id)}
              >
                {renderCardShell(card, phase, false)}
              </button>
            </div>
          )
        })}
        </div>
      </div>
    </div>
  )
}
