import type { Card as CardType } from '../game/cards'
import { Card } from './Card'

interface CardFanProps {
  cards: CardType[]
  small?: boolean
  /** Pixels each card shifts right; auto-tightens for large books. */
  peek?: number
}

export function CardFan({ cards, small = true, peek }: CardFanProps) {
  if (cards.length === 0) return null

  const cardWidth = small ? 44 : 64
  const cardHeight = small ? 64 : 96
  const step =
    peek ?? Math.max(8, Math.min(small ? 14 : 18, Math.floor(56 / cards.length)))

  const fanWidth = cardWidth + (cards.length - 1) * step

  return (
    <div
      className="relative shrink-0"
      style={{ width: fanWidth, height: cardHeight }}
      aria-label={`${cards.length} cards`}
    >
      {cards.map((card, index) => (
        <div
          key={card.id}
          className="absolute top-0 shadow-sm"
          style={{
            left: index * step,
            zIndex: index,
          }}
        >
          <Card card={card} small={small} />
        </div>
      ))}
    </div>
  )
}
