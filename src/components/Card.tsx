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
 * Classic Bicycle joker motif: crowned king riding past the 808 milestone.
 * Line-forward so it still reads on tiny hand cards.
 */
function JokerFigure({ className = '' }: { className?: string }) {
  const uid = useId().replace(/:/g, '')
  const skinId = `joker-skin-${uid}`
  const robeId = `joker-robe-${uid}`
  const stoneId = `joker-stone-${uid}`
  const crownId = `joker-crown-${uid}`

  return (
    <svg
      viewBox="0 0 72 90"
      className={className}
      aria-hidden
      preserveAspectRatio="xMidYMid meet"
    >
      <defs>
        <linearGradient id={skinId} x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#f6ddc4" />
          <stop offset="100%" stopColor="#d9b08f" />
        </linearGradient>
        <linearGradient id={robeId} x1="15%" y1="0%" x2="85%" y2="100%">
          <stop offset="0%" stopColor="#e04545" />
          <stop offset="50%" stopColor="#b01e2e" />
          <stop offset="100%" stopColor="#6e101c" />
        </linearGradient>
        <linearGradient id={stoneId} x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#cfc8b8" />
          <stop offset="100%" stopColor="#8f8778" />
        </linearGradient>
        <linearGradient id={crownId} x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#f6e27a" />
          <stop offset="100%" stopColor="#c9a227" />
        </linearGradient>
      </defs>

      {/* Soft ground */}
      <ellipse cx="40" cy="83.5" rx="22" ry="2.4" fill="rgba(40,30,20,0.14)" />
      <path
        d="M10 78 Q40 74 68 78"
        fill="none"
        stroke="rgba(40,30,20,0.18)"
        strokeWidth="0.8"
      />

      {/* 808 milestone */}
      <g transform="translate(3 34)">
        <path
          d="M3 42 L3 7 Q3 2 9 2 L15 2 Q21 2 21 7 L21 42 Z"
          fill={`url(#${stoneId})`}
          stroke="#4a4338"
          strokeWidth="0.85"
        />
        <path d="M1 42 H23 L21 46 H3 Z" fill="#7a7366" />
        <rect x="5.5" y="8" width="13" height="14" rx="1" fill="#ebe4d6" stroke="#4a4338" strokeWidth="0.5" />
        <text
          x="12"
          y="18.5"
          textAnchor="middle"
          fill="#1f1810"
          fontFamily="Georgia, 'Times New Roman', serif"
          fontSize="7"
          fontWeight="700"
        >
          808
        </text>
      </g>

      {/* Bike wheels */}
      <g stroke="#1a1420" fill="none">
        <circle cx="27" cy="71" r="10" strokeWidth="1.5" />
        <circle cx="27" cy="71" r="7.2" strokeWidth="0.55" opacity="0.55" />
        <circle cx="27" cy="71" r="1.8" fill="#1a1420" stroke="none" />
        <line x1="27" y1="61.2" x2="27" y2="80.8" strokeWidth="0.55" opacity="0.65" />
        <line x1="17.2" y1="71" x2="36.8" y2="71" strokeWidth="0.55" opacity="0.65" />
        <line x1="20" y1="64" x2="34" y2="78" strokeWidth="0.5" opacity="0.45" />
        <line x1="34" y1="64" x2="20" y2="78" strokeWidth="0.5" opacity="0.45" />

        <circle cx="57" cy="71" r="10" strokeWidth="1.5" />
        <circle cx="57" cy="71" r="7.2" strokeWidth="0.55" opacity="0.55" />
        <circle cx="57" cy="71" r="1.8" fill="#1a1420" stroke="none" />
        <line x1="57" y1="61.2" x2="57" y2="80.8" strokeWidth="0.55" opacity="0.65" />
        <line x1="47.2" y1="71" x2="66.8" y2="71" strokeWidth="0.55" opacity="0.65" />
        <line x1="50" y1="64" x2="64" y2="78" strokeWidth="0.5" opacity="0.45" />
        <line x1="64" y1="64" x2="50" y2="78" strokeWidth="0.5" opacity="0.45" />
      </g>

      {/* Frame / bars / pedals */}
      <g stroke="#1a1420" fill="none" strokeLinecap="round" strokeLinejoin="round">
        <path d="M27 71 L39 48 L57 71" strokeWidth="1.55" />
        <path d="M39 48 L49 56 L57 71" strokeWidth="1.35" />
        <path d="M39 48 L37.5 42" strokeWidth="1.4" />
        <path d="M33.5 42.5 L41.5 40.5" strokeWidth="2" />
        <path d="M49 56 L53.5 44" strokeWidth="1.35" />
        <path d="M50.5 44 L58 42" strokeWidth="1.8" />
        <circle cx="42.5" cy="61" r="2.5" strokeWidth="1.2" />
        <path d="M42.5 61 L38.5 66.5" strokeWidth="1.15" />
        <path d="M42.5 61 L47 56.5" strokeWidth="1.15" />
      </g>

      {/* Seated king — robe & legs */}
      <path
        d="M33 44 C29 52 27.5 60 29.5 68 L35.5 66.5 C35 58 36.5 50 40.5 45 Z"
        fill={`url(#${robeId})`}
        stroke="#5c0e18"
        strokeWidth="0.45"
      />
      <path
        d="M43 46 C48 53 52.5 60 55 68 L49 68 C47.5 59 45 52 42 47 Z"
        fill={`url(#${robeId})`}
        stroke="#5c0e18"
        strokeWidth="0.45"
      />
      <path
        d="M31 33 C35.5 28.5 48 28.5 52.5 34.5 L50.5 49 C46.5 54 35.5 54 32 47.5 Z"
        fill={`url(#${robeId})`}
        stroke="#5c0e18"
        strokeWidth="0.55"
      />
      {/* Ermine trim + sash */}
      <path d="M33.5 47 H49.5" stroke="#f4efe4" strokeWidth="1.7" strokeLinecap="round" />
      <circle cx="36" cy="47" r="0.7" fill="#2a1a22" />
      <circle cx="41.5" cy="47" r="0.7" fill="#2a1a22" />
      <circle cx="47" cy="47" r="0.7" fill="#2a1a22" />
      <path d="M34 40.5 Q42 45 50 40.5" fill="none" stroke="#e8c35a" strokeWidth="1.45" />

      {/* Arms to handlebars */}
      <path
        d="M49.5 37 C54 40.5 56.5 44 57.5 46.5"
        fill="none"
        stroke={`url(#${skinId})`}
        strokeWidth="2.55"
        strokeLinecap="round"
      />
      <path
        d="M34.5 37 C30.5 41 33 45.5 37.5 47"
        fill="none"
        stroke={`url(#${skinId})`}
        strokeWidth="2.55"
        strokeLinecap="round"
      />
      <circle cx="57.5" cy="46.5" r="1.35" fill={`url(#${skinId})`} stroke="#a88868" strokeWidth="0.35" />
      <circle cx="37.5" cy="47" r="1.35" fill={`url(#${skinId})`} stroke="#a88868" strokeWidth="0.35" />

      {/* Head + king features */}
      <ellipse
        cx="42"
        cy="25.5"
        rx="8.2"
        ry="9"
        fill={`url(#${skinId})`}
        stroke="#a88868"
        strokeWidth="0.45"
      />
      {/* Sideburns / hair */}
      <path d="M34.2 24 Q33 29 35.5 32" fill="none" stroke="#2a1a22" strokeWidth="1.1" />
      <path d="M49.8 24 Q51 29 48.5 32" fill="none" stroke="#2a1a22" strokeWidth="1.1" />
      <ellipse cx="38.6" cy="24.8" rx="1.05" ry="1.25" fill="#1a1420" />
      <ellipse cx="45.4" cy="24.8" rx="1.05" ry="1.25" fill="#1a1420" />
      {/* Arched court-card mustache */}
      <path
        d="M37.2 29.2 C39 28.4 41 28.2 42 28.6 C43 28.2 45 28.4 46.8 29.2 C45.2 30.8 43.2 31.6 42 31.4 C40.8 31.6 38.8 30.8 37.2 29.2 Z"
        fill="#1a1420"
      />
      <path
        d="M39.8 32.4 Q42 33.6 44.2 32.4"
        fill="none"
        stroke="#8a4a3a"
        strokeWidth="0.7"
        strokeLinecap="round"
      />

      {/* Gold crown — the classic Bicycle king cue */}
      <path
        d="M33.5 19.5 L33.5 14 L36.2 17.2 L39 12.5 L42 17.5 L45 12.5 L47.8 17.2 L50.5 14 L50.5 19.5 Z"
        fill={`url(#${crownId})`}
        stroke="#8a6a18"
        strokeWidth="0.55"
      />
      <rect x="33.5" y="19" width="17" height="2.4" rx="0.4" fill="#e8c35a" stroke="#8a6a18" strokeWidth="0.4" />
      <circle cx="36.2" cy="17" r="1.05" fill="#c41e3a" />
      <circle cx="42" cy="16.2" r="1.15" fill="#1f4d9c" />
      <circle cx="47.8" cy="17" r="1.05" fill="#c41e3a" />
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

/** Compact joker: Bicycle king-on-bike art instead of a "J" that reads as jack. */
function CompactJokerFace({ tier }: { tier: 'micro' | 'tiny' }) {
  return (
    <div className="playing-card-face-inner playing-card-face-compact playing-card-face-joker">
      <span className="playing-card-joker-index" aria-hidden>
        US
      </span>
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
          className={`playing-card playing-card-face playing-card-joker ${sizeClass} ${liftClass} ${className}`}
          aria-label={cardLabel(card)}
        >
          <CompactJokerFace tier={tier} />
        </div>
      )
    }

    return (
      <div
        className={`playing-card playing-card-face playing-card-joker ${sizeClass} ${liftClass} ${className}`}
        aria-label={cardLabel(card)}
      >
        <div className="playing-card-face-inner playing-card-face-joker playing-card-face-joker-full">
          <span className="playing-card-joker-index playing-card-joker-index-full" aria-hidden>
            US
          </span>
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
