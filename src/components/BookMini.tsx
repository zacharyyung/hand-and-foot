import type { Card as CardType } from '../game/cards'
import { isRedThree, isWildCard } from '../game/cards'
import type { CardMotionKind } from '../game/cardMotion'
import { Card } from './Card'
import { AnimatedCardShell } from './AnimatedCardShell'

function bookFaceCard(cards: CardType[]): CardType {
  const natural = cards.find((c) => !isWildCard(c) && !isRedThree(c))
  return natural ?? cards[0]
}

function stackLayers(cardCount: number): number {
  if (cardCount <= 1) return 0
  if (cardCount === 2) return 1
  return 2
}

interface BookMiniProps {
  cards: CardType[]
  bookId: string
  flightAnchorPrefix?: string
  completed?: boolean
  clean?: boolean
  wildCount?: number
  getCardMotion?: (cardId: string) => CardMotionKind | undefined
  isCardHidden?: (cardId: string) => boolean
  className?: string
}

/** Compact single-card book tile for phone layouts — tactile but space-efficient. */
export function BookMini({
  cards,
  bookId,
  flightAnchorPrefix = 'book',
  completed = false,
  clean = true,
  wildCount = 0,
  getCardMotion,
  isCardHidden,
  className = '',
}: BookMiniProps) {
  if (cards.length === 0) return null

  const face = bookFaceCard(cards)
  const layers = stackLayers(cards.length)
  const faceHidden = isCardHidden?.(face.id)

  return (
    <div
      className={`book-mini ${completed ? 'book-mini-complete' : ''} ${className}`}
      title={`${face.rank}s · ${cards.length} cards${wildCount > 0 ? ` · ${wildCount} wild` : ''}${completed ? (clean ? ' · clean' : ' · dirty') : ''}`}
    >
      <div className="book-mini-stack">
        {layers >= 2 && (
          <div className="book-mini-layer book-mini-layer--2" aria-hidden>
            <Card faceDown micro />
          </div>
        )}
        {layers >= 1 && (
          <div className="book-mini-layer book-mini-layer--1" aria-hidden>
            <Card faceDown micro />
          </div>
        )}
        <div className="book-mini-face">
          <span
            data-flight-anchor={`${flightAnchorPrefix}-${bookId}`}
            className="pointer-events-none absolute left-1/2 top-1/2 z-0 h-0 w-0 -translate-x-1/2 -translate-y-1/2"
            aria-hidden
          />
          <AnimatedCardShell
            motion={faceHidden ? undefined : getCardMotion?.(face.id)}
            className={faceHidden ? 'opacity-0' : 'block'}
          >
            <Card card={face} micro />
          </AnimatedCardShell>
        </div>
      </div>

      <div
        className="book-mini-meta"
        aria-label={`${cards.length} cards${wildCount > 0 ? `, ${wildCount} wild` : ''}`}
      >
        {wildCount > 0 && (
          <span
            className={`book-mini-meta-wild ${wildCount >= 2 ? 'book-mini-meta-wild-full' : ''}`}
            aria-hidden
          >
            {wildCount}
          </span>
        )}
        <span className="book-mini-meta-count" aria-hidden>
          {cards.length}
        </span>
      </div>

      {completed && (
        <span
          className={`book-mini-status ${clean ? 'book-mini-status-clean' : 'book-mini-status-dirty'}`}
          title={clean ? 'Clean book' : 'Dirty book'}
        >
          {clean ? 'C' : 'D'}
        </span>
      )}
    </div>
  )
}
