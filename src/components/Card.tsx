import type { Card as CardType } from '../game/cards'
import { cardLabel, isRedCard, isWildCard } from '../game/cards'
import { useId } from 'react'

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

function BicycleCardBack({ tiny, small }: { tiny?: boolean; small?: boolean }) {
  const uid = useId().replace(/:/g, '')
  const diamondPatternId = `bicycle-diamonds-${uid}`
  const centerGlowId = `bicycle-center-glow-${uid}`
  const brandSize = tiny ? 4.5 : small ? 5.5 : 7

  return (
    <div className="bicycle-card-back-inner">
      <svg
        viewBox="0 0 100 140"
        className="h-full w-full"
        aria-hidden
        preserveAspectRatio="xMidYMid slice"
      >
        <defs>
          <pattern id={diamondPatternId} width="8" height="8" patternUnits="userSpaceOnUse">
            <path
              d="M4 0 L8 4 L4 8 L0 4 Z"
              fill="none"
              stroke="rgba(255,255,255,0.14)"
              strokeWidth="0.45"
            />
          </pattern>
          <radialGradient id={centerGlowId} cx="50%" cy="45%" r="55%">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0.22" />
            <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
          </radialGradient>
        </defs>

        <rect width="100" height="140" fill="#1a3a6e" />
        <rect x="4" y="4" width="92" height="132" fill={`url(#${diamondPatternId})`} />
        <rect
          x="8"
          y="8"
          width="84"
          height="124"
          fill="none"
          stroke="rgba(255,255,255,0.22)"
          strokeWidth="1.2"
          rx="2"
        />
        <rect
          x="12"
          y="12"
          width="76"
          height="116"
          fill="none"
          stroke="rgba(200,40,40,0.35)"
          strokeWidth="0.8"
          rx="1.5"
        />

        <ellipse cx="50" cy="68" rx="28" ry="34" fill={`url(#${centerGlowId})`} />
        <ellipse
          cx="50"
          cy="68"
          rx="24"
          ry="30"
          fill="none"
          stroke="rgba(255,255,255,0.35)"
          strokeWidth="1"
        />

        {/* Winged wheel motif */}
        <g transform="translate(50 58)" fill="none" stroke="rgba(255,255,255,0.55)" strokeWidth="1.1">
          <circle r="10" />
          <circle r="3.5" fill="rgba(255,255,255,0.35)" stroke="none" />
          {[0, 45, 90, 135, 180, 225, 270, 315].map((deg) => (
            <line
              key={deg}
              x1="0"
              y1="-3.5"
              x2="0"
              y2="-10"
              transform={`rotate(${deg})`}
            />
          ))}
          <path d="M-18 -4 C-14 -14 -6 -18 0 -12 C6 -18 14 -14 18 -4" strokeWidth="0.9" />
          <path d="M-18 4 C-14 14 -6 18 0 12 C6 18 14 14 18 4" strokeWidth="0.9" />
        </g>

        <text
          x="50"
          y="98"
          textAnchor="middle"
          fill="rgba(255,255,255,0.88)"
          fontFamily="Georgia, 'Times New Roman', serif"
          fontSize={brandSize}
          fontWeight="600"
          letterSpacing="0.08em"
        >
          BICYCLE
        </text>
        <text
          x="50"
          y="108"
          textAnchor="middle"
          fill="rgba(255,255,255,0.45)"
          fontFamily="Georgia, 'Times New Roman', serif"
          fontSize={brandSize * 0.55}
          letterSpacing="0.14em"
        >
          TRADEMARK
        </text>

        <text
          x="50"
          y="18"
          textAnchor="middle"
          fill="rgba(255,255,255,0.5)"
          fontSize="7"
          fontFamily="Georgia, serif"
        >
          ★
        </text>
        <text
          x="50"
          y="128"
          textAnchor="middle"
          fill="rgba(255,255,255,0.5)"
          fontSize="7"
          fontFamily="Georgia, serif"
          transform="rotate(180 50 128)"
        >
          ★
        </text>
      </svg>
    </div>
  )
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
        className={`playing-card playing-card-back playing-card-bicycle ${sizeClass} ${liftClass} ${className}`}
        aria-label="Face-down card"
      >
        <BicycleCardBack tiny={tiny} small={small} />
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
