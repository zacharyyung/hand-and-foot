import type { Card as CardType } from '../game/cards'
import { cardLabel, isRedCard, isWildCard } from '../game/cards'

/** Shared wild styling — deep wine, not neon. */
export const WILD_TEXT_CLASS = 'text-rose-200'
export const WILD_RING_CLASS = 'ring-rose-300/50'

interface CardProps {
  card?: CardType
  faceDown?: boolean
  small?: boolean
  tiny?: boolean
  lifted?: boolean
  className?: string
}

function suitGlyph(suit: CardType['suit']): string {
  if (suit === 'hearts') return '♥'
  if (suit === 'diamonds') return '♦'
  if (suit === 'clubs') return '♣'
  if (suit === 'spades') return '♠'
  return '★'
}

export function Card({
  card,
  faceDown = false,
  small = false,
  tiny = false,
  lifted = false,
  className = '',
}: CardProps) {
  const sizeClass = tiny
    ? 'h-11 w-[1.85rem] text-[7px]'
    : small
      ? 'h-[4.1rem] w-[2.85rem] text-[11px] sm:h-16 sm:w-11 sm:text-xs'
      : 'h-24 w-16 text-sm'

  const liftClass = lifted ? '-translate-y-2 shadow-card-lift' : ''

  if (faceDown || !card) {
    return (
      <div
        className={`playing-card playing-card-back ${sizeClass} ${liftClass} ${className}`}
        aria-label="Face-down card"
      >
        <div className="flex h-full items-center justify-center p-1">
          <div
            className={`rounded-full border border-white/25 ${tiny ? 'h-4 w-4' : small ? 'h-6 w-6' : 'h-8 w-8'}`}
            style={{
              background:
                'repeating-conic-gradient(from 0deg, rgba(255,255,255,0.12) 0 8deg, transparent 8deg 16deg)',
            }}
          />
        </div>
      </div>
    )
  }

  if (card.rank === 'Joker') {
    return (
      <div
        className={`playing-card playing-card-wild ${sizeClass} ${liftClass} ${className}`}
        aria-label={cardLabel(card)}
      >
        <div className="flex h-full flex-col items-center justify-center gap-0.5 p-1">
          <span
            className={`font-display font-semibold leading-none tracking-wide ${
              tiny ? 'text-[6px]' : small ? 'text-[8px]' : 'text-[10px]'
            }`}
          >
            JOKER
          </span>
          <span className={`leading-none opacity-90 ${tiny ? 'text-base' : small ? 'text-xl' : 'text-3xl'}`}>
            ★
          </span>
        </div>
      </div>
    )
  }

  if (isWildCard(card)) {
    return (
      <div
        className={`playing-card playing-card-wild ${sizeClass} ${liftClass} ${className}`}
        aria-label={cardLabel(card)}
      >
        <div className="flex h-full flex-col justify-between p-1 font-semibold sm:p-1.5">
          <span className="leading-none">2</span>
          <span className="text-center text-[0.95em] leading-none opacity-90">
            {suitGlyph(card.suit)}
          </span>
          <span className="rotate-180 self-end leading-none">2</span>
        </div>
      </div>
    )
  }

  const isRed = isRedCard(card)
  const textColor = isRed ? 'text-red-700' : 'text-stone-800'

  return (
    <div
      className={`playing-card playing-card-face ${sizeClass} ${liftClass} ${textColor} ${className}`}
      aria-label={cardLabel(card)}
    >
      <div className="flex h-full flex-col justify-between p-1 font-semibold sm:p-1.5">
        <span className="leading-none tracking-tight">{card.rank}</span>
        <span
          className="text-center leading-none"
          style={{ fontSize: tiny ? '0.65rem' : undefined }}
        >
          {suitGlyph(card.suit)}
        </span>
        <span className="rotate-180 self-end leading-none tracking-tight">{card.rank}</span>
      </div>
    </div>
  )
}
