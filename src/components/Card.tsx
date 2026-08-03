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

/**
 * Minimal joker icon: white three-point jester hat on the wild face.
 * Paired with a fancy corner "J" so the card reads as a joker at a glance
 * (wine chrome + hat keep it distinct from a jack).
 */
function JokerHatIcon({ className = '' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 64 64"
      className={className}
      aria-hidden
      preserveAspectRatio="xMidYMid meet"
    >
      {/*
        Flat fool's-cap silhouette:
        tall center point, flared side points, concave brim.
      */}
      <path
        fill="#ffffff"
        d="
          M32 12
          L28.5 30
          C24 27.5 17.5 27 12.5 31.5
          L10 34.5
          C14.5 36.5 19 35 22.5 32.5
          L24 46
          C26.5 42.5 29 41 32 41
          C35 41 37.5 42.5 40 46
          L41.5 32.5
          C45 35 49.5 36.5 54 34.5
          L51.5 31.5
          C46.5 27 40 27.5 35.5 30
          Z
        "
      />
      <circle cx="32" cy="10.5" r="4" fill="#ffffff" />
      <circle cx="10.5" cy="33.5" r="3.7" fill="#ffffff" />
      <circle cx="53.5" cy="33.5" r="3.7" fill="#ffffff" />
    </svg>
  )
}

function JokerFace({ tier }: { tier: CardTier }) {
  const markClass =
    tier === 'micro'
      ? 'text-[11px]'
      : tier === 'tiny'
        ? 'text-[13px]'
        : tier === 'small'
          ? 'text-[14px]'
          : 'text-[15px]'

  return (
    <div className="playing-card-face-inner playing-card-face-joker">
      <span
        className={`playing-card-joker-mark font-display ${markClass}`}
        aria-hidden
      >
        J
      </span>
      <JokerHatIcon className="playing-card-joker-hat" />
    </div>
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
    return (
      <div
        className={`playing-card playing-card-wild playing-card-joker ${sizeClass} ${liftClass} ${className}`}
        aria-label={cardLabel(card)}
      >
        <JokerFace tier={tier} />
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
