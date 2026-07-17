import type { Card as CardType } from '../game/cards'
import type { CardMotionKind } from '../game/cardMotion'
import { cardFanLayout } from './cardFanLayout'
import { Card } from './Card'
import { AnimatedCardShell } from './AnimatedCardShell'

interface CardFanProps {
  cards: CardType[]
  small?: boolean
  tiny?: boolean
  peek?: number
  stacked?: boolean
  animate?: boolean
  getCardMotion?: (cardId: string) => CardMotionKind | undefined
  isCardHidden?: (cardId: string) => boolean
  faceDown?: boolean
}

export function CardFan({
  cards,
  small = true,
  tiny = false,
  peek,
  stacked = false,
  animate = false,
  getCardMotion,
  isCardHidden,
  faceDown = false,
}: CardFanProps) {
  if (cards.length === 0) return null

  const layout = cardFanLayout(cards.length, { small, tiny, stacked, peek })

  return (
    <div
      className={`relative shrink-0 ${animate ? 'animate-book-settle' : ''} ${
        stacked ? 'drop-shadow-md' : ''
      }`}
      style={{ width: layout.fanWidth, height: layout.cardHeight }}
      aria-label={`${cards.length} cards`}
    >
      {cards.map((card, index) => {
        const rot = layout.rotation(index)
        const hidden = isCardHidden?.(card.id)
        return (
          <div
            key={card.id}
            className="absolute top-0"
            style={{
              left: index * layout.step,
              zIndex: index,
              transform: `rotate(${rot}deg)`,
              transformOrigin: 'bottom center',
            }}
          >
            <AnimatedCardShell
              motion={hidden ? undefined : getCardMotion?.(card.id)}
              className={hidden ? 'opacity-0' : 'block book-card-at-rest'}
            >
              <Card card={faceDown ? undefined : card} faceDown={faceDown} small={!tiny} tiny={tiny} />
            </AnimatedCardShell>
          </div>
        )
      })}
    </div>
  )
}
