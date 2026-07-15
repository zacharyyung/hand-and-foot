import type { Card as CardType } from '../game/cards'
import { cardLabel, isRedCard } from '../game/cards'

interface CardProps {
  card?: CardType
  faceDown?: boolean
  small?: boolean
}

export function Card({ card, faceDown = false, small = false }: CardProps) {
  const sizeClass = small ? 'h-16 w-11 text-xs' : 'h-24 w-16 text-sm'

  if (faceDown || !card) {
    return (
      <div
        className={`${sizeClass} rounded-lg border-2 border-white/30 bg-gradient-to-br from-blue-800 to-blue-950 shadow-md`}
        aria-label="Face-down card"
      >
        <div className="flex h-full items-center justify-center">
          <div className="h-8 w-8 rounded-full border border-white/20 bg-blue-700/50" />
        </div>
      </div>
    )
  }

  if (card.rank === 'Joker') {
    return (
      <div
        className={`${sizeClass} rounded-lg border-2 border-fuchsia-400 bg-gradient-to-br from-fuchsia-600 via-purple-600 to-violet-800 shadow-md`}
        aria-label={cardLabel(card)}
      >
        <div className="flex h-full flex-col items-center justify-center gap-0.5 p-1 text-white">
          <span className={`font-black leading-none ${small ? 'text-[9px]' : 'text-[10px]'}`}>
            JOKER
          </span>
          <span className={`leading-none ${small ? 'text-2xl' : 'text-4xl'}`}>🃏</span>
          <span
            className={`rotate-180 font-black leading-none ${small ? 'text-[9px]' : 'text-[10px]'}`}
          >
            JOKER
          </span>
        </div>
      </div>
    )
  }

  const isRed = isRedCard(card)
  const textColor = isRed ? 'text-red-600' : 'text-slate-900'

  return (
    <div
      className={`${sizeClass} rounded-lg border border-slate-300 bg-white shadow-md`}
      aria-label={cardLabel(card)}
    >
      <div className={`flex h-full flex-col justify-between p-1.5 font-bold ${textColor}`}>
        <span className="leading-none">{card.rank}</span>
        <span className="text-center text-lg leading-none">
          {card.suit === 'hearts'
            ? '♥'
            : card.suit === 'diamonds'
              ? '♦'
              : card.suit === 'clubs'
                ? '♣'
                : '♠'}
        </span>
        <span className="rotate-180 self-end leading-none">{card.rank}</span>
      </div>
    </div>
  )
}
