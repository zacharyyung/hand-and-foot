import type { Card as CardType } from '../game/cards'
import type { CardMotionKind } from '../game/cardMotion'
import type { FlightAnchor } from '../game/flightAnchors'
import { stackRotationDeg } from './cardFanLayout'
import { Card } from './Card'
import { AnimatedCardShell } from './AnimatedCardShell'

interface CardPileProps {
  cards: CardType[]
  label?: string
  faceDown?: boolean
  showTopCard?: boolean
  small?: boolean
  tiny?: boolean
  interactive?: boolean
  onClick?: () => void
  highlight?: boolean
  flightAnchor?: FlightAnchor
  getCardMotion?: (cardId: string) => CardMotionKind | undefined
  isCardHidden?: (cardId: string) => boolean
}

export function CardPile({
  cards,
  label,
  faceDown = false,
  showTopCard = false,
  small = false,
  tiny = false,
  interactive = false,
  onClick,
  highlight = false,
  flightAnchor,
  getCardMotion,
  isCardHidden,
}: CardPileProps) {
  let displayTopCard: CardType | undefined
  let displayCount = 0
  for (let i = cards.length - 1; i >= 0; i--) {
    if (!isCardHidden?.(cards[i].id)) {
      displayTopCard = cards[i]
      displayCount = i + 1
      break
    }
  }

  const depth = Math.min(displayCount, tiny ? 3 : 4)
  const sizeH = tiny ? 'h-[3.25rem]' : small ? 'h-[4.1rem]' : 'h-24'
  const sizeW = tiny ? 'w-[2.125rem]' : small ? 'w-[2.85rem]' : 'w-16'
  const cardSmall = !tiny && small
  const cardTiny = tiny

  const pile = (
    <div
      className={`relative transition-transform duration-[220ms] ease-snappy ${
        highlight ? 'scale-[1.04]' : ''
      } ${interactive ? 'cursor-pointer hover:-translate-y-0.5 hover:z-[60]' : ''}`}
      {...(flightAnchor ? { 'data-flight-anchor': flightAnchor } : {})}
    >
      {/* Depth layers under the top card */}
      {depth > 1 &&
        Array.from({ length: depth - 1 }).map((_, i) => {
          const tilt = stackRotationDeg(flightAnchor ?? 'pile', i)
          return (
          <div
            key={i}
            className="absolute transition-transform duration-[220ms] ease-snappy"
            style={{
              left: (i + 1) * 1.5,
              top: (i + 1) * 1.5,
              zIndex: i,
              opacity: 0.55 + i * 0.1,
              transform: `rotate(${tilt}deg)`,
              transformOrigin: 'center center',
            }}
            aria-hidden
          >
            <Card faceDown small={cardSmall} tiny={cardTiny} />
          </div>
        )})}

      {displayTopCard ? (
        <div
          className="relative z-10 shadow-pile"
          style={{ transform: depth > 1 ? `translate(${(depth - 1) * 0.5}px, ${(depth - 1) * 0.5}px)` : undefined }}
        >
          <AnimatedCardShell
            motion={
              showTopCard && !faceDown && displayTopCard
                ? getCardMotion?.(displayTopCard.id)
                : undefined
            }
            className="block"
          >
            <Card
              card={showTopCard && !faceDown ? displayTopCard : undefined}
              faceDown={faceDown || !showTopCard}
              small={cardSmall}
              tiny={cardTiny}
            />
          </AnimatedCardShell>
        </div>
      ) : cards.length > 0 ? (
        <div
          className={`relative z-10 ${sizeH} ${sizeW}`}
          aria-hidden
        />
      ) : (
        <div
          className={`flex ${sizeH} ${sizeW} items-center justify-center rounded-[0.55rem] border border-dashed border-white/20 bg-black/15 text-[10px] text-ink-faint`}
        >
          —
        </div>
      )}

      {cards.length > 0 && (
        <span className="absolute -bottom-1 left-1/2 z-20 -translate-x-1/2 rounded-full bg-black/55 px-1 py-px font-sans text-[8px] font-semibold tabular-nums text-ink-soft backdrop-blur-sm">
          {cards.length}
        </span>
      )}
    </div>
  )

  return (
    <div className={`flex flex-col items-center ${tiny ? 'gap-0.5' : small ? 'gap-1' : 'gap-2'}`}>
      {label && (
        <span
          className={`font-sans font-medium uppercase tracking-[0.14em] text-ink-muted ${
            tiny ? 'text-[7px]' : small ? 'text-[8px]' : 'text-[10px]'
          }`}
        >
          {label}
        </span>
      )}
      {interactive && onClick ? (
        <button type="button" onClick={onClick} className="appearance-none border-0 bg-transparent p-0">
          {pile}
        </button>
      ) : (
        pile
      )}
    </div>
  )
}
