import type { Book } from '../game/books'
import { bookWildCount, isCleanBook } from '../game/books'
import { CardFan } from './CardFan'
import { TEAM_COLORS } from '../game/teams'

interface TeamBooksProps {
  books: Book[]
  teamId: number
  highlightTeamId?: number
  compact?: boolean
  label?: string
}

export function TeamBooks({
  books,
  teamId,
  highlightTeamId,
  compact = false,
  label,
}: TeamBooksProps) {
  const teamBooks = books.filter((b) => b.teamId === teamId)
  const color = TEAM_COLORS[teamId]
  const highlighted = highlightTeamId === teamId

  if (teamBooks.length === 0) {
    if (compact) return null
    return (
      <div
        className={`rounded-lg border border-dashed px-3 py-2 text-xs text-white/40 ${
          highlighted ? 'border-white/30' : 'border-white/10'
        }`}
        style={highlighted ? { borderColor: `${color}88` } : undefined}
      >
        {label ?? `Team ${teamId + 1}`} — no books yet
      </div>
    )
  }

  if (compact) {
    return (
      <div className="flex flex-row flex-nowrap items-end justify-center gap-1.5">
        {teamBooks.map((book) => {
          const completed = book.cards.length >= 7
          const clean = isCleanBook(book)
          return (
            <div
              key={book.id}
              className="rounded-md border border-white/10 bg-black/30 px-2 py-1"
              style={{ borderColor: `${color}44` }}
            >
              <p className="mb-0.5 text-center text-[10px] text-white/60">
                {book.rank}s · {book.cards.length}
                {clean ? ' · C' : ' · D'}
                {completed && ' ★'}
              </p>
              <div className="flex justify-center">
                <CardFan cards={book.cards} small />
              </div>
            </div>
          )
        })}
      </div>
    )
  }

  return (
    <div
      className={`rounded-xl border p-3 ${highlighted ? 'border-white/30 bg-black/30' : 'border-white/10 bg-black/10'}`}
      style={highlighted ? { borderColor: `${color}66` } : undefined}
    >
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide" style={{ color }}>
        {label ?? `Team ${teamId + 1} books`}
      </p>
      <div className="flex flex-wrap gap-3">
        {teamBooks.map((book) => {
          const wilds = bookWildCount(book)
          const completed = book.cards.length >= 7
          const clean = isCleanBook(book)

          return (
            <div key={book.id} className="rounded-lg bg-white/5 p-2">
              <p className="mb-1 text-xs text-white/70">
                {book.rank}s · {book.cards.length} cards ·{' '}
                {clean ? 'Clean' : 'Dirty'}
                {wilds > 0 && ` (${wilds} wild)`}
                {completed && ' ★'}
              </p>
              <CardFan cards={book.cards} small />
            </div>
          )
        })}
      </div>
    </div>
  )
}
