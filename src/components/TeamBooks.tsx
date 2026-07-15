import type { Book } from '../game/books'
import { bookWildCount, cardsForBookFan, isCleanBook, sortBooks } from '../game/books'
import { WILD_TEXT_CLASS, WILD_RING_CLASS } from './Card'
import { CardFan } from './CardFan'
import { TEAM_COLORS } from '../game/teams'

interface TeamBooksProps {
  books: Book[]
  teamId: number
  highlightTeamId?: number
  compact?: boolean
  label?: string
}

function WildCountBadge({ count }: { count: number }) {
  return (
    <span
      className={`flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-black/70 px-0.5 text-[8px] font-bold leading-none ${WILD_TEXT_CLASS} ring-1 ${WILD_RING_CLASS}`}
      aria-label={`${count} wild cards`}
    >
      {count}
    </span>
  )
}

function BookStatusMark({ clean }: { clean: boolean }) {
  return (
    <span
      className={`font-display text-[9px] font-semibold leading-none tracking-wide ${
        clean ? 'text-red-400' : 'text-ink-soft'
      }`}
      title={clean ? 'Clean book' : 'Dirty book'}
    >
      {clean ? 'C' : 'D'}
    </span>
  )
}

function BookDisplay({ book }: { book: Book }) {
  const completed = book.cards.length >= 7
  const clean = isCleanBook(book)
  const wilds = bookWildCount(book)

  return (
    <div className={`relative group ${completed ? 'animate-book-settle' : ''}`}>
      {completed && (
        <div className="absolute -right-0.5 -top-1.5 z-20 rounded bg-black/50 px-1 py-0.5 backdrop-blur-sm">
          <BookStatusMark clean={clean} />
        </div>
      )}
      {!clean && wilds > 0 && (
        <div className="absolute -left-1 -top-1.5 z-20">
          <WildCountBadge count={wilds} />
        </div>
      )}
      <div className="transition-transform duration-200 ease-settle group-hover:-translate-y-0.5">
        <CardFan cards={cardsForBookFan(book.cards)} small stacked={completed} animate={completed} />
      </div>
      <p className="mt-0.5 text-center font-sans text-[9px] tabular-nums text-ink-faint">
        {book.rank}
        <span className="opacity-50">·</span>
        {book.cards.length}
      </p>
    </div>
  )
}

export function TeamBooks({
  books,
  teamId,
  highlightTeamId,
  compact = false,
  label,
}: TeamBooksProps) {
  const teamBooks = sortBooks(books.filter((b) => b.teamId === teamId))
  const color = TEAM_COLORS[teamId]
  const highlighted = highlightTeamId === teamId

  if (teamBooks.length === 0) {
    if (compact) return null
    return (
      <div className="px-2 py-1.5 text-xs text-ink-faint">
        {label ?? `Team ${teamId + 1}`} — no books yet
      </div>
    )
  }

  if (compact) {
    return (
      <>
        {teamBooks.map((book) => (
          <div key={book.id} className="shrink-0 px-0.5 py-0.5">
            <BookDisplay book={book} />
          </div>
        ))}
      </>
    )
  }

  return (
    <div className="p-2">
      <p
        className="mb-2 font-sans text-[10px] font-semibold uppercase tracking-[0.12em]"
        style={{ color }}
      >
        {label ?? `Team ${teamId + 1}`}
      </p>
      <div className="flex flex-wrap gap-3">
        {teamBooks.map((book) => (
          <BookDisplay key={book.id} book={book} />
        ))}
      </div>
      {highlighted && <span className="sr-only">Your team</span>}
    </div>
  )
}
