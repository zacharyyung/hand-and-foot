import { useLayoutEffect, useMemo, useState } from 'react'
import type { Card as CardType } from '../game/cards'
import type { CardMotionKind } from '../game/cardMotion'
import { reorderHandOrder } from '../game/handOrder'
import { HAND_LAYOUT_MS } from '../game/cardFlight'
import { playSound } from '../game/audio'
import { Card } from './Card'
import { AnimatedCardShell } from './AnimatedCardShell'

interface HandCardsProps {
  hand: CardType[]
  handOrder: string[]
  onReorder: (order: string[]) => void
  selectedIds: string[]
  onToggle: (cardId: string) => void
  canSelect?: boolean
  canDrag?: boolean
  /** Spread cards with gaps, centered — for the player hand dock. */
  spread?: boolean
  getCardMotion?: (cardId: string) => CardMotionKind | undefined
  onPlaceMotion?: (cardId: string) => void
  isCardHidden?: (cardId: string) => boolean
}

/** Snappy card motion — keep in sync with cardFlight / cardMotion. */
const CARD_MS = 220

/** Active cards pop above board chrome and neighbor cards. */
const Z = {
  base: 1,
  selected: 40,
  hover: 60,
  drag: 100,
} as const

type CardSlotPhase = 'in-flight' | 'visible'

/** Left offsets with extra gaps around selected / hovered cards for easier hitting. */
function fanOffsets(
  count: number,
  selected: boolean[],
  hoverIndex: number | null,
): { lefts: number[]; width: number } {
  const base = Math.max(24, Math.min(42, 520 / Math.max(count, 1)))
  const selectedGap = 16
  const hoverGap = 12
  const cardW = 46

  const lefts: number[] = []
  let x = 0
  for (let i = 0; i < count; i++) {
    lefts.push(x)
    if (i < count - 1) {
      let step = base
      if (selected[i] || selected[i + 1]) step += selectedGap
      if (
        hoverIndex !== null &&
        (hoverIndex === i || hoverIndex === i + 1)
      ) {
        step += hoverGap
      }
      x += step
    }
  }

  return { lefts, width: Math.max(cardW, x + cardW) }
}

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
  canSelect = true,
  canDrag = true,
  spread = false,
  getCardMotion,
  onPlaceMotion,
  isCardHidden,
}: HandCardsProps) {
  const [dragCardId, setDragCardId] = useState<string | null>(null)
  const [dropCardId, setDropCardId] = useState<string | null>(null)
  const [hoverCardId, setHoverCardId] = useState<string | null>(null)
  /** Hold draw-spread timing until layout settles so width doesn't snap mid-reveal. */
  const [layoutSpreadHold, setLayoutSpreadHold] = useState(false)

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

    const holdMs = HAND_LAYOUT_MS + 16
    const timer = window.setTimeout(() => setLayoutSpreadHold(false), holdMs)
    return () => window.clearTimeout(timer)
  }, [hasIncoming, layoutSpreadHold])

  const handSpreadMs = hasIncoming || layoutSpreadHold ? HAND_LAYOUT_MS : CARD_MS

  const hoverIndex = hoverCardId
    ? displayCards.findIndex((c) => c.id === hoverCardId)
    : null
  const selectedFlags = displayCards.map((c) => selectedIds.includes(c.id))
  const { lefts, width: fanWidth } = fanOffsets(n, selectedFlags, hoverIndex)

  function slotPhase(cardId: string): CardSlotPhase {
    return isCardHidden?.(cardId) ? 'in-flight' : 'visible'
  }

  function handleDragStart(cardId: string) {
    if (!canDrag) return
    setDragCardId(cardId)
    playSound('select')
  }

  function handleDragOver(e: React.DragEvent, cardId: string) {
    e.preventDefault()
    if (!canDrag || dragCardId === null) return
    setDropCardId(cardId)
  }

  function handleDrop(targetCardId: string) {
    if (!canDrag || dragCardId === null) return
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
    playSound(wasSelected ? 'deselect' : 'select')
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
        <Card card={card} small lifted={lifted} />
      </AnimatedCardShell>
    )
  }

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
              onClick={() => handleToggle(card.id)}
              disabled={!canSelect || inFlight}
              className={`will-change-transform shrink-0 transition-transform ease-snappy ${
                isSelected
                  ? 'z-[60] -translate-y-3 scale-105'
                  : 'z-[1] hover:z-[60] hover:-translate-y-3 hover:scale-105'
              } ${inFlight ? 'pointer-events-none' : ''}`}
              style={{ transitionDuration: `${CARD_MS}ms` }}
            >
              {renderCardShell(card, phase, isSelected)}
            </button>
          )
        })}
      </div>
    )
  }

  const maxRot = Math.min(22, 3 + n * 0.45)

  return (
    <div
      className="relative mx-auto flex w-full max-w-5xl justify-center px-2"
      style={{ minHeight: n > 0 ? '6.25rem' : undefined }}
      onMouseLeave={() => setHoverCardId(null)}
    >
      <div
        className="relative transition-[width] ease-snappy will-change-[width]"
        style={{
          width: fanWidth,
          height: '5.75rem',
          transitionDuration: `${handSpreadMs}ms`,
        }}
      >
        {displayCards.map((card, index) => {
          const isSelected = selectedFlags[index]
          const isHovered = hoverCardId === card.id
          const isDragging = dragCardId === card.id
          const isDropTarget =
            dropCardId === card.id && dragCardId !== null && dragCardId !== card.id
          const phase = slotPhase(card.id)
          const inFlight = phase === 'in-flight'
          const t = n <= 1 ? 0 : index / (n - 1)
          const rot = -maxRot / 2 + t * maxRot
          const lift = isSelected ? 16 : isHovered ? 12 : 0
          const arcY = Math.abs(t - 0.5) * 14
          const isActive = isDragging || isHovered || isSelected

          let z = Z.base + index
          if (isDragging) z = Z.drag
          else if (isHovered) z = Z.hover
          else if (isSelected) z = Z.selected

          return (
            <div
              key={card.id}
              draggable={canDrag && !inFlight}
              onDragStart={() => handleDragStart(card.id)}
              onDragOver={(e) => handleDragOver(e, card.id)}
              onDrop={() => handleDrop(card.id)}
              onDragEnd={handleDragEnd}
              onMouseEnter={() => setHoverCardId(card.id)}
              onFocus={() => setHoverCardId(card.id)}
              className={`absolute bottom-0 origin-bottom will-change-transform transition-[transform,left,z-index] ease-snappy ${
                isDragging ? 'opacity-40' : ''
              } ${isDropTarget ? 'brightness-110' : ''} ${
                canDrag && !inFlight
                  ? 'cursor-grab active:cursor-grabbing'
                  : 'cursor-default'
              } ${inFlight ? 'pointer-events-none' : ''}`}
              style={{
                left: lefts[index],
                zIndex: z,
                transform: `translate3d(0, ${arcY - lift}px, 0) rotate(${rot}deg)`,
                transitionDuration: `${handSpreadMs}ms`,
              }}
            >
              <span
                data-flight-anchor={`hand-${card.id}`}
                data-flight-rotation={rot}
                className="pointer-events-none absolute left-1/2 top-1/2 z-0 h-0 w-0 -translate-x-1/2 -translate-y-1/2"
                aria-hidden
              />
              <button
                type="button"
                onClick={() => handleToggle(card.id)}
                disabled={!canSelect || inFlight}
                className={`relative block rounded-lg outline-none transition-transform ease-snappy will-change-transform ${
                  isActive ? 'scale-105' : 'scale-100'
                } ${
                  isSelected
                    ? 'ring-2 ring-accent ring-offset-2 ring-offset-felt-dark'
                    : canSelect
                      ? 'hover:brightness-[1.03]'
                      : ''
                }`}
                style={{ transitionDuration: `${CARD_MS}ms` }}
                draggable={false}
                aria-pressed={isSelected}
                aria-hidden={inFlight}
              >
                {renderCardShell(card, phase, isSelected || isHovered)}
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}
