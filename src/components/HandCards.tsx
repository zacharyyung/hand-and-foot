import { useState } from 'react'
import type { Card as CardType } from '../game/cards'
import { reorderHandOrder } from '../game/handOrder'
import { Card } from './Card'

interface HandCardsProps {
  hand: CardType[]
  handOrder: string[]
  onReorder: (order: string[]) => void
  selectedIds: string[]
  onToggle: (cardId: string) => void
  canSelect?: boolean
  canDrag?: boolean
}

export function HandCards({
  hand,
  handOrder,
  onReorder,
  selectedIds,
  onToggle,
  canSelect = true,
  canDrag = true,
}: HandCardsProps) {
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [dropIndex, setDropIndex] = useState<number | null>(null)

  const orderedCards = handOrder
    .map((id) => hand.find((c) => c.id === id))
    .filter((c): c is CardType => c !== undefined)

  const orphanCards = hand.filter((c) => !handOrder.includes(c.id))
  const displayCards = [...orderedCards, ...orphanCards]

  function handleDragStart(index: number) {
    if (!canDrag) return
    setDragIndex(index)
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
  }

  function handleDragEnd() {
    setDragIndex(null)
    setDropIndex(null)
  }

  return (
    <div className="flex flex-wrap justify-center gap-1 sm:justify-start">
      {displayCards.map((card, index) => {
        const isSelected = selectedIds.includes(card.id)
        const isDragging = dragIndex === index
        const isDropTarget = dropIndex === index && dragIndex !== null && dragIndex !== index

        return (
          <div
            key={card.id}
            draggable={canDrag}
            onDragStart={() => handleDragStart(index)}
            onDragOver={(e) => handleDragOver(e, index)}
            onDrop={() => handleDrop(index)}
            onDragEnd={handleDragEnd}
            className={`rounded-lg transition ${
              isDragging ? 'scale-95 opacity-40' : ''
            } ${isDropTarget ? 'ring-2 ring-sky-400 ring-offset-2 ring-offset-felt-dark' : ''} ${
              isSelected ? 'ring-2 ring-amber-400 ring-offset-2 ring-offset-felt-dark' : ''
            } ${canDrag ? 'cursor-grab active:cursor-grabbing hover:scale-105' : 'cursor-default'}`}
          >
            <button
              type="button"
              onClick={() => canSelect && onToggle(card.id)}
              disabled={!canSelect}
              className="block"
              draggable={false}
            >
              <Card card={card} small />
            </button>
          </div>
        )
      })}
    </div>
  )
}
