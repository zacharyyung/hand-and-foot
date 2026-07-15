import type { Card as CardType } from '../game/cards'
import { Card } from './Card'

interface CardFanProps {
  cards: CardType[]
  small?: boolean
  /** Pixels each card shifts right; auto-tightens for large books. */
  peek?: number
  /** Tight stack for completed books. */
  stacked?: boolean
  /** Soft settle animation when books update. */
  animate?: boolean
}

export function CardFan({
  cards,
  small = true,
  peek,
  stacked = false,
  animate = false,
}: CardFanProps) {
  if (cards.length === 0) return null

  const cardWidth = small ? 44 : 64
  const cardHeight = small ? 64 : 96
  const step = stacked
    ? 2.5
    : peek ?? Math.max(7, Math.min(small ? 13 : 17, Math.floor(52 / cards.length)))

  const fanWidth = cardWidth + (cards.length - 1) * step

  return (
    <div
      className={`relative shrink-0 ${animate ? 'animate-book-settle' : ''} ${
        stacked ? 'drop-shadow-md' : ''
      }`}
      style={{ width: fanWidth, height: cardHeight }}
      aria-label={`${cards.length} cards`}
    >
      {cards.map((card, index) => {
        const rot = stacked ? 0 : (index - (cards.length - 1) / 2) * 0.6
        return (
          <div
            key={card.id}
            className="absolute top-0"
            style={{
              left: index * step,
              zIndex: index,
              transform: `rotate(${rot}deg)`,
              transformOrigin: 'bottom center',
            }}
          >
            <Card card={card} small={small} />
          </div>
        )
      })}
    </div>
  )
}
