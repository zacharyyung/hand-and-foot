import type { Card, Rank } from '../game/cards'
import { cardsForBookFan } from '../game/books'
import { meldContributionFromCards } from '../game/scoring'
import { CardFan } from './CardFan'

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
  /** Slim top ribbon above the hand toolbar in the player dock. */
  ribbon?: boolean
}

export function StagingArea({
  stagedBooks,
  requiredPoints,
  onRemove,
  onClear,
  compact = false,
  ribbon = false,
}: StagingAreaProps) {
  const stagedPoints = stagedBooks.reduce(
    (sum, book) => sum + meldContributionFromCards(book.cards),
    0,
  )
  const met = stagedPoints >= requiredPoints

  if (stagedBooks.length === 0) {
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
    return (
      <div className="animate-fade-up px-3 py-1.5 sm:px-4 lg:px-6">
        <div className="flex flex-wrap items-center justify-center gap-x-2.5 gap-y-1">
          <p
            className={`font-display text-sm font-semibold tabular-nums ${
              met ? 'text-accent' : 'text-ink-soft'
            }`}
          >
            {stagedPoints}
            <span className="text-ink-faint">/{requiredPoints}</span>
          </p>
          <div className="flex flex-wrap items-center justify-center gap-1.5">
            {stagedBooks.map((book) => (
              <div
                key={book.id}
                className="flex items-center gap-1 rounded-lg bg-black/25 px-1.5 py-0.5"
              >
                <CardFan cards={cardsForBookFan(book.cards)} small />
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
            <CardFan cards={cardsForBookFan(book.cards)} small />
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
