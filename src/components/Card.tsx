import type { Card as CardType } from '../game/cards'
import { cardLabel, isRedCard, isRedThree, isWildCard } from '../game/cards'
import { useId } from 'react'
import { CARD_SIZE_CLASS } from './cardSizes'

/** Shared wild styling — deep wine, not neon. */
export const WILD_TEXT_CLASS = 'text-rose-200'
export const WILD_RING_CLASS = 'ring-rose-300/50'

interface CardProps {
  card?: CardType
  faceDown?: boolean
  small?: boolean
  tiny?: boolean
  micro?: boolean
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

/** Classic court-jester bust — keeps jokers distinct from the jack's "J". */
function JokerFigure({ className = '' }: { className?: string }) {
  const uid = useId().replace(/:/g, '')
  const faceGlowId = `joker-face-glow-${uid}`

  return (
    <svg
      viewBox="0 0 64 80"
      className={className}
      aria-hidden
      preserveAspectRatio="xMidYMid meet"
    >
      <defs>
        <radialGradient id={faceGlowId} cx="50%" cy="42%" r="55%">
          <stop offset="0%" stopColor="#fff8f0" stopOpacity="0.95" />
          <stop offset="100%" stopColor="#f0d4c4" stopOpacity="0.9" />
        </radialGradient>
      </defs>

      {/* Collar points */}
      <path
        d="M14 58 L20 48 L26 58 L32 46 L38 58 L44 48 L50 58 Z"
        fill="#f4d35e"
        stroke="rgba(255,240,200,0.55)"
        strokeWidth="0.8"
      />
      <circle cx="20" cy="58" r="2.2" fill="#e8b85c" />
      <circle cx="32" cy="58" r="2.2" fill="#c45c6a" />
      <circle cx="44" cy="58" r="2.2" fill="#5b8fd9" />

      {/* Shoulders / tunic */}
      <path
        d="M16 62 C22 54 42 54 48 62 L52 76 L12 76 Z"
        fill="#6b2d4a"
        stroke="rgba(255,220,200,0.35)"
        strokeWidth="0.7"
      />
      <path d="M28 58 L32 72 L36 58" fill="#f4d35e" opacity="0.85" />

      {/* Head */}
      <ellipse cx="32" cy="36" rx="14" ry="16" fill={`url(#${faceGlowId})`} />

      {/* Jester hat — three points with bells */}
      <path
        d="M18 30 C16 18 22 8 32 12 C42 8 48 18 46 30 L40 28 C42 20 38 14 32 16 C26 14 22 20 24 28 Z"
        fill="#5b8fd9"
        stroke="rgba(255,255,255,0.35)"
        strokeWidth="0.7"
      />
      <path d="M22 28 L14 10 L26 26 Z" fill="#c45c6a" />
      <path d="M42 28 L50 10 L38 26 Z" fill="#f4d35e" />
      <path d="M28 16 L32 4 L36 16 Z" fill="#6b2d4a" />
      <circle cx="14" cy="10" r="2.4" fill="#f4d35e" stroke="rgba(255,255,255,0.4)" strokeWidth="0.5" />
      <circle cx="50" cy="10" r="2.4" fill="#c45c6a" stroke="rgba(255,255,255,0.4)" strokeWidth="0.5" />
      <circle cx="32" cy="4" r="2.6" fill="#5b8fd9" stroke="rgba(255,255,255,0.4)" strokeWidth="0.5" />

      {/* Eyes + smile */}
      <ellipse cx="26.5" cy="34" rx="2.2" ry="2.6" fill="#2a1a22" />
      <ellipse cx="37.5" cy="34" rx="2.2" ry="2.6" fill="#2a1a22" />
      <circle cx="27.2" cy="33.2" r="0.7" fill="#fff8f0" />
      <circle cx="38.2" cy="33.2" r="0.7" fill="#fff8f0" />
      <path
        d="M25 42 Q32 48 39 42"
        fill="none"
        stroke="#2a1a22"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
      {/* Cheek flush */}
      <ellipse cx="22" cy="40" rx="2.5" ry="1.4" fill="#e89a9a" opacity="0.55" />
      <ellipse cx="42" cy="40" rx="2.5" ry="1.4" fill="#e89a9a" opacity="0.55" />
    </svg>
  )
}

function BicycleCardBack({
  micro,
  tiny,
  small,
}: {
  micro?: boolean
  tiny?: boolean
  small?: boolean
}) {
  const uid = useId().replace(/:/g, '')
  const diamondPatternId = `bicycle-diamonds-${uid}`
  const centerGlowId = `bicycle-center-glow-${uid}`
  const brandSize = micro ? 3.5 : tiny ? 4.5 : small ? 5.5 : 7

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

type CardTier = 'micro' | 'tiny' | 'small' | 'large'

function cardTier(micro: boolean, tiny: boolean, small: boolean): CardTier {
  if (micro) return 'micro'
  if (tiny) return 'tiny'
  if (small) return 'small'
  return 'large'
}

/** Compact phone faces: huge rank fills the card; suit stays a quiet cue. */
function CompactFace({
  card,
  tier,
  wild = false,
}: {
  card: CardType
  tier: 'micro' | 'tiny'
  wild?: boolean
}) {
  const redThree = isRedThree(card)
  const glyph = suitGlyph(card.suit)
  const rank = card.rank
  const isTen = rank === '10'

  /* Rank is the whole point on mobile — size it to dominate the face. */
  const centerRankClass =
    tier === 'micro'
      ? isTen
        ? 'text-[1.05rem]'
        : 'text-[1.35rem]'
      : isTen
        ? 'text-[1.55rem]'
        : 'text-[1.85rem]'

  const indexRankClass =
    tier === 'micro'
      ? isTen
        ? 'text-[9px]'
        : 'text-[11px]'
      : isTen
        ? 'text-[11px]'
        : 'text-[13px]'

  /* Suit only shouts for red threes; otherwise a whisper under the peek index. */
  const suitClass = redThree
    ? tier === 'micro'
      ? 'text-[10px]'
      : 'text-[12px]'
    : tier === 'micro'
      ? 'text-[6px] opacity-45'
      : 'text-[7px] opacity-40'

  return (
    <div
      className={`playing-card-face-inner playing-card-face-compact ${
        wild ? 'playing-card-face-wild-inner' : ''
      }`}
    >
      <div className="playing-card-index">
        <span
          className={`playing-card-rank font-display font-bold leading-none tracking-tight ${indexRankClass}`}
        >
          {rank}
        </span>
        <span className={`playing-card-suit leading-none ${suitClass}`} aria-hidden>
          {glyph}
        </span>
      </div>

      <span
        className={`playing-card-center-rank font-display font-bold leading-none tracking-tight ${centerRankClass}`}
        aria-hidden
      >
        {rank}
      </span>

      {redThree ? (
        <span
          className={`playing-card-center-suit leading-none ${
            tier === 'micro' ? 'text-[12px]' : 'text-[15px]'
          }`}
          aria-hidden
        >
          {glyph}
        </span>
      ) : (
        <span
          className={`playing-card-foot-suit leading-none ${
            tier === 'micro' ? 'text-[7px] opacity-40' : 'text-[8px] opacity-35'
          }`}
          aria-hidden
        >
          {glyph}
        </span>
      )}
    </div>
  )
}

/** Compact joker: jester portrait instead of a "J" that reads as jack. */
function CompactJokerFace({ tier }: { tier: 'micro' | 'tiny' }) {
  return (
    <div className="playing-card-face-inner playing-card-face-compact playing-card-face-joker">
      <JokerFigure
        className={`playing-card-joker-figure ${
          tier === 'micro' ? 'playing-card-joker-figure-micro' : 'playing-card-joker-figure-tiny'
        }`}
      />
    </div>
  )
}

export function Card({
  card,
  faceDown = false,
  small = false,
  tiny = false,
  micro = false,
  lifted = false,
  className = '',
}: CardProps) {
  const tier = cardTier(micro, tiny, small)
  const sizeClass = CARD_SIZE_CLASS[tier]
  const liftClass = lifted ? '-translate-y-2 shadow-card-lift' : ''

  if (faceDown || !card) {
    return (
      <div
        className={`playing-card playing-card-back playing-card-bicycle ${sizeClass} ${liftClass} ${className}`}
        aria-label="Face-down card"
      >
        <BicycleCardBack micro={micro} tiny={tiny && !micro} small={small && !tiny && !micro} />
      </div>
    )
  }

  if (card.rank === 'Joker') {
    if (tier === 'micro' || tier === 'tiny') {
      return (
        <div
          className={`playing-card playing-card-wild ${sizeClass} ${liftClass} ${className}`}
          aria-label={cardLabel(card)}
        >
          <CompactJokerFace tier={tier} />
        </div>
      )
    }

    return (
      <div
        className={`playing-card playing-card-wild ${sizeClass} ${liftClass} ${className}`}
        aria-label={cardLabel(card)}
      >
        <div className="playing-card-face-inner playing-card-face-joker playing-card-face-joker-full">
          <JokerFigure
            className={`playing-card-joker-figure ${
              small ? 'playing-card-joker-figure-small' : 'playing-card-joker-figure-large'
            }`}
          />
        </div>
      </div>
    )
  }

  if (isWildCard(card)) {
    if (tier === 'micro' || tier === 'tiny') {
      return (
        <div
          className={`playing-card playing-card-wild ${sizeClass} ${liftClass} ${className}`}
          aria-label={cardLabel(card)}
        >
          <CompactFace card={card} tier={tier} wild />
        </div>
      )
    }

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
  const redThree = isRedThree(card)

  if (tier === 'micro' || tier === 'tiny') {
    return (
      <div
        className={`playing-card playing-card-face ${sizeClass} ${liftClass} ${textColor} ${
          redThree ? 'playing-card-red-three' : ''
        } ${className}`}
        aria-label={cardLabel(card)}
      >
        <CompactFace card={card} tier={tier} />
      </div>
    )
  }

  return (
    <div
      className={`playing-card playing-card-face ${sizeClass} ${liftClass} ${textColor} ${
        redThree ? 'playing-card-red-three' : ''
      } ${className}`}
      aria-label={cardLabel(card)}
    >
      <div className="flex h-full flex-col justify-between p-1 font-semibold sm:p-1.5">
        <span className="leading-none tracking-tight">{card.rank}</span>
        <span
          className={`text-center leading-none ${redThree ? 'text-[1.15em]' : 'opacity-70'}`}
        >
          {suitGlyph(card.suit)}
        </span>
        <span className="rotate-180 self-end leading-none tracking-tight">{card.rank}</span>
      </div>
    </div>
  )
}
