import type { Card as CardType } from '../game/cards'
import { Card } from './Card'

interface CardPileProps {
  cards: CardType[]
  label: string
  faceDown?: boolean
  showTopCard?: boolean
  small?: boolean
}

export function CardPile({ cards, label, faceDown = false, showTopCard = false, small = false }: CardPileProps) {
  const topCard = cards[cards.length - 1]

  return (
    <div className="flex flex-col items-center gap-2">
      <span className="text-xs font-medium uppercase tracking-wide text-white/70">{label}</span>
      <div className="relative">
        {cards.length > 1 && (
          <div className="absolute left-1 top-1">
            <Card faceDown={faceDown || !showTopCard} small={small} />
          </div>
        )}
        {cards.length > 0 ? (
          <Card card={showTopCard && !faceDown ? topCard : undefined} faceDown={faceDown || !showTopCard} small={small} />
        ) : (
          <div className={`flex ${small ? 'h-16 w-11' : 'h-24 w-16'} items-center justify-center rounded-lg border-2 border-dashed border-white/20 text-xs text-white/40`}>
            Empty
          </div>
        )}
      </div>
      <span className="text-sm text-white/80">{cards.length} cards</span>
    </div>
  )
}
