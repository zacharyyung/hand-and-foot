import type { Card, Rank } from '../game/cards'
import { isWildCard } from '../game/cards'
import type { CardMotionKind } from '../game/cardMotion'
import { cardsForBookFan } from '../game/books'
import { meldContributionFromCards } from '../game/scoring'
import { cardFanLayout } from './cardFanLayout'
import { CardFan } from './CardFan'
import { BookMini } from './BookMini'

export interface StagedBook {
  id: string
  cardIds: string[]
  rank: Rank
  cards: Card[]
}

interface StagingAreaProps {
  stagedBooks: StagedBook[]
  requiredPoints: number
  onRemove: (id: string) => void
  onClear: () => void
  compact?: boolean
  /** Slim inline strip in the south dock hand meta row. */
  ribbon?: boolean
  /** Sit inside the H/F toolbar row without extra vertical padding. */
  embedded?: boolean
  /** Rank/count chips instead of fanned cards. */
  mobile?: boolean
  getCardMotion?: (cardId: string) => CardMotionKind | undefined
  isCardHidden?: (cardId: string) => boolean
}

function StagedBookMini({
  book,
  getCardMotion,
  isCardHidden,
}: {
  book: StagedBook
  getCardMotion?: (cardId: string) => CardMotionKind | undefined
  isCardHidden?: (cardId: string) => boolean
}) {
  const wildCount = book.cards.filter(isWildCard).length

  return (
    <BookMini
      cards={book.cards}
      bookId={book.id}
      flightAnchorPrefix="staging"
      wildCount={wildCount}
      getCardMotion={getCardMotion}
      isCardHidden={isCardHidden}
      className="staged-book-mini"
    />
  )
}

function StagedBookFan({
  book,
  mobile = false,
  getCardMotion,
  isCardHidden,
}: {
  book: StagedBook
  mobile?: boolean
  getCardMotion?: (cardId: string) => CardMotionKind | undefined
  isCardHidden?: (cardId: string) => boolean
}) {
  if (mobile) {
    return <StagedBookMini book={book} getCardMotion={getCardMotion} isCardHidden={isCardHidden} />
  }

  const fanCards = cardsForBookFan(book.cards)
  const layout = cardFanLayout(fanCards.length, { small: true })
  const landingIndex = Math.max(0, Math.floor((fanCards.length - 1) / 2))
  const landing = { x: layout.fanWidth / 2, y: layout.cardHeight / 2 }

  return (
    <div className="relative">
      <span
        data-flight-anchor={`staging-${book.id}`}
        data-flight-rotation={layout.rotation(landingIndex)}
        className="pointer-events-none absolute z-0 h-0 w-0"
        style={{ left: landing.x, top: landing.y }}
        aria-hidden
      />
      <CardFan
        cards={fanCards}
        small
        getCardMotion={getCardMotion}
        isCardHidden={isCardHidden}
      />
    </div>
  )
}

export function StagingArea({
  stagedBooks,
  requiredPoints,
  onRemove,
  onClear,
  compact = false,
  ribbon = false,
  embedded = false,
  mobile = false,
  getCardMotion,
  isCardHidden,
}: StagingAreaProps) {
  const stagedPoints = stagedBooks.reduce(
    (sum, book) => sum + meldContributionFromCards(book.cards),
    0,
  )
  const met = stagedPoints >= requiredPoints

  if (stagedBooks.length === 0) {
    if (ribbon && embedded) return null
    if (ribbon) {
      return (
        <div className="px-3 py-1 sm:px-4 lg:px-6">
          <p className="text-center text-[10px] text-accent/80 sm:text-[11px]">
            Stage private melds · need{' '}
            <span className="font-semibold tabular-nums text-accent">{requiredPoints}+</span>
          </p>
        </div>
      )
    }
    if (compact) return null
    return (
      <div className="mb-4 px-4 py-3">
        <p className="text-xs text-accent/80">
          Private staging — need {requiredPoints}+ points before meld.
        </p>
      </div>
    )
  }

  if (ribbon) {
    const rowClass = embedded
      ? 'flex min-w-0 flex-1 flex-wrap items-center justify-center gap-x-2 gap-y-0.5'
      : 'flex flex-wrap items-center justify-center gap-x-2.5 gap-y-1 px-3 py-1.5 sm:px-4 lg:px-6'

    return (
      <div className={rowClass} data-flight-anchor="staging">
        <p
          className={`font-display text-xs font-semibold tabular-nums sm:text-sm ${
            met ? 'text-accent' : 'text-ink-soft'
          }`}
        >
          {stagedPoints}
          <span className="text-ink-faint">/{requiredPoints}</span>
        </p>
        <div className="flex flex-wrap items-center justify-center gap-1">
          {stagedBooks.map((book) => (
            <div
              key={book.id}
              className="flex items-center gap-1 rounded-lg bg-black/25 px-1.5 py-0.5"
            >
              <StagedBookFan
                book={book}
                mobile={mobile}
                getCardMotion={getCardMotion}
                isCardHidden={isCardHidden}
              />
              <button
                type="button"
                onClick={() => onRemove(book.id)}
                className="ml-0.5 text-[11px] leading-none text-ink-muted hover:text-red-300"
                aria-label={`Remove staged ${book.rank}s book`}
              >
                ×
              </button>
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={onClear}
          className="text-[10px] text-ink-faint hover:text-ink-soft"
        >
          Clear
        </button>
      </div>
    )
  }

  return (
    <div className={`${compact ? 'px-2 py-1.5' : 'mb-4 px-4 py-3'}`}>
      <div className={`flex flex-wrap items-center justify-between gap-2 ${compact ? '' : 'mb-2'}`}>
        <p className={`font-semibold text-accent ${compact ? 'text-[10px]' : 'text-xs'}`}>
          Staged {stagedPoints}/{requiredPoints}
        </p>
        <button
          type="button"
          onClick={onClear}
          className="text-[10px] text-ink-faint hover:text-ink-soft"
        >
          Clear
        </button>
      </div>

      <div className={compact ? 'flex flex-wrap gap-1' : 'space-y-2'}>
        {stagedBooks.map((book) => (
          <div
            key={book.id}
            className={`flex flex-wrap items-center gap-1.5 rounded-lg bg-black/25 ${
              compact ? 'px-1.5 py-1' : 'px-2 py-2'
            }`}
          >
            <StagedBookFan
              book={book}
              mobile={mobile}
              getCardMotion={getCardMotion}
              isCardHidden={isCardHidden}
            />
            <button
              type="button"
              onClick={() => onRemove(book.id)}
              className="ml-auto text-[10px] text-ink-muted hover:text-red-300"
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
