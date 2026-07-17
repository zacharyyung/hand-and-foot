import { useState } from 'react'
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
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [dropIndex, setDropIndex] = useState<number | null>(null)
  const [hoverIndex, setHoverIndex] = useState<number | null>(null)

  const orderedCards = handOrder
    .map((id) => hand.find((c) => c.id === id))
    .filter((c): c is CardType => c !== undefined)

  const orphanCards = hand.filter((c) => !handOrder.includes(c.id))
  const displayCards = [...orderedCards, ...orphanCards]
  const n = displayCards.length

  const selectedFlags = displayCards.map((c) => selectedIds.includes(c.id))
  const { lefts, width: fanWidth } = fanOffsets(n, selectedFlags, hoverIndex)
  const spreadingForDraw = displayCards.some((c) => isCardHidden?.(c.id))
  const handSpreadMs = spreadingForDraw ? HAND_LAYOUT_MS : 200

  function handleDragStart(index: number) {
    if (!canDrag) return
    setDragIndex(index)
    playSound('select')
  }

  function handleDragOver(e: React.DragEvent, index: number) {
    e.preventDefault()
    if (!canDrag || dragIndex === null) return
    setDropIndex(index)
  }

  function handleDrop(index: number) {
    if (!canDrag || dragIndex === null) return
    const ids = displayCards.map((c) => c.id)
    onReorder(reorderHandOrder(ids, dragIndex, index))
    setDragIndex(null)
    setDropIndex(null)
    onPlaceMotion?.(displayCards[dragIndex].id)
    playSound('place')
  }

  function handleDragEnd() {
    setDragIndex(null)
    setDropIndex(null)
  }

  function handleToggle(cardId: string) {
    if (!canSelect) return
    const wasSelected = selectedIds.includes(cardId)
    onToggle(cardId)
    playSound(wasSelected ? 'deselect' : 'select')
  }

  if (!spread) {
    return (
      <div className="flex flex-wrap justify-center gap-1.5 p-1 sm:justify-start">
        {displayCards.map((card) => {
          const isSelected = selectedIds.includes(card.id)
          return (
            <button
              key={card.id}
              type="button"
              onClick={() => handleToggle(card.id)}
              disabled={!canSelect}
              className={`shrink-0 transition-transform duration-200 ease-settle ${
                isSelected ? '-translate-y-2' : 'hover:-translate-y-1'
              }`}
            >
              <AnimatedCardShell
                motion={isCardHidden?.(card.id) ? undefined : getCardMotion?.(card.id)}
                className={`hand-card-at-rest block ${isCardHidden?.(card.id) ? 'opacity-0' : ''}`}
              >
                <Card card={card} small lifted={isSelected} />
              </AnimatedCardShell>
            </button>
          )
        })}
      </div>
    )
  }

  /* Arc fan — spreads open around hover / selection so neighbors stay hittable */
  const maxRot = Math.min(22, 3 + n * 0.45)

  return (
    <div
      className="relative mx-auto flex w-full max-w-5xl justify-center px-2"
      style={{ minHeight: n > 0 ? '6.25rem' : undefined }}
      onMouseLeave={() => setHoverIndex(null)}
    >
      <div
        className="relative transition-[width] ease-out"
        style={{
          width: fanWidth,
          height: '5.75rem',
          transitionDuration: `${handSpreadMs}ms`,
        }}
      >
        {displayCards.map((card, index) => {
          const isSelected = selectedFlags[index]
          const isHovered = hoverIndex === index
          const isDragging = dragIndex === index
          const isDropTarget =
            dropIndex === index && dragIndex !== null && dragIndex !== index
          const isIncoming = isCardHidden?.(card.id)
          const t = n <= 1 ? 0 : index / (n - 1)
          const rot = -maxRot / 2 + t * maxRot
          const lift = isSelected ? 16 : isHovered ? 8 : 0
          const arcY = Math.abs(t - 0.5) * 14

          let z = index
          if (isHovered) z = n + 20
          else if (isSelected) z = n + 5

          return (
            <div
              key={card.id}
              draggable={canDrag}
              onDragStart={() => handleDragStart(index)}
              onDragOver={(e) => handleDragOver(e, index)}
              onDrop={() => handleDrop(index)}
              onDragEnd={handleDragEnd}
              onMouseEnter={() => setHoverIndex(index)}
              onFocus={() => setHoverIndex(index)}
              className={`absolute bottom-0 origin-bottom ${
                isIncoming
                  ? ''
                  : 'transition-[transform,left] ease-out'
              } ${isDragging ? 'opacity-40' : ''} ${isDropTarget ? 'brightness-110' : ''} ${
                canDrag ? 'cursor-grab active:cursor-grabbing' : 'cursor-default'
              }`}
              style={{
                left: lefts[index],
                zIndex: z,
                transform: `translateY(${arcY - lift}px) rotate(${rot}deg)`,
                ...(isIncoming ? {} : { transitionDuration: `${handSpreadMs}ms` }),
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
                disabled={!canSelect}
                className={`relative block rounded-lg outline-none transition-shadow duration-200 ${
                  isSelected
                    ? 'ring-2 ring-accent ring-offset-2 ring-offset-felt-dark'
                    : canSelect
                      ? 'hover:brightness-[1.03]'
                      : ''
                }`}
                draggable={false}
                aria-pressed={isSelected}
              >
                <AnimatedCardShell
                  motion={isCardHidden?.(card.id) ? undefined : getCardMotion?.(card.id)}
                  className={`hand-card-at-rest block ${isCardHidden?.(card.id) ? 'opacity-0' : ''}`}
                >
                  <Card card={card} small lifted={isSelected || isHovered} />
                </AnimatedCardShell>
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}
