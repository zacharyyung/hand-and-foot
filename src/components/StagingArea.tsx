import type { Card } from '../game/cards'
import { sumCardPoints } from '../game/scoring'
import type { Rank } from '../game/cards'
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
}

export function StagingArea({
  stagedBooks,
  requiredPoints,
  onRemove,
  onClear,
}: StagingAreaProps) {
  const stagedPoints = stagedBooks.reduce(
    (sum, book) => sum + sumCardPoints(book.cards),
    0,
  )

  if (stagedBooks.length === 0) {
    return (
      <div className="mb-4 rounded-xl border border-dashed border-amber-500/30 bg-amber-500/5 px-4 py-3">
        <p className="text-xs text-amber-200/80">
          <span className="font-semibold">Private staging</span> — only you can see cards
          here until you click Meld. Stage books totaling {requiredPoints}+ points.
        </p>
      </div>
    )
  }

  return (
    <div className="mb-4 rounded-xl border border-amber-500/40 bg-amber-950/40 px-4 py-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-semibold text-amber-200">
          Staged meld — hidden from others ({stagedPoints} / {requiredPoints} pts)
        </p>
        <button
          type="button"
          onClick={onClear}
          className="text-[10px] text-amber-200/70 underline hover:text-amber-100"
        >
          Clear all
        </button>
      </div>

      <div className="space-y-2">
        {stagedBooks.map((book) => (
          <div
            key={book.id}
            className="flex flex-wrap items-center gap-2 rounded-lg bg-black/30 px-2 py-2"
          >
            <span className="text-xs text-white/60">
              {book.rank}s · {sumCardPoints(book.cards)} pts
            </span>
            <div className="flex items-center">
              <CardFan cards={book.cards} small />
            </div>
            <button
              type="button"
              onClick={() => onRemove(book.id)}
              className="ml-auto text-[10px] text-red-300 hover:text-red-200"
            >
              Remove
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
