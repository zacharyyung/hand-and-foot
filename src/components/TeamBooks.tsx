import type { Book } from '../game/books'
import type { CardMotionKind } from '../game/cardMotion'
import { bookWildCount, cardsForBookFan, isCleanBook, sortBooks } from '../game/books'
import { WILD_TEXT_CLASS, WILD_RING_CLASS } from './Card'
import { CardFan } from './CardFan'
import { cardFanLayout } from './cardFanLayout'
import type { CompassSide } from '../game/tableLayout'
import { TEAM_COLORS } from '../game/teams'

interface TeamBooksProps {
  books: Book[]
  teamId: number
  highlightTeamId?: number
  compact?: boolean
  /** Rank/count chips instead of fanned cards (phone layouts). */
  mobile?: boolean
  label?: string
  getCardMotion?: (cardId: string) => CardMotionKind | undefined
  isCardHidden?: (cardId: string) => boolean
}

function WildCountBadge({ count }: { count: number }) {
  return (
    <span
      className={`flex h-4 min-w-4 items-center justify-center rounded-full bg-black/75 px-0.5 text-[8px] font-bold leading-none ${WILD_TEXT_CLASS} ring-1 ${WILD_RING_CLASS}`}
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

function BookCountBadge({ count, completed }: { count: number; completed: boolean }) {
  return (
    <div
      className={`absolute -bottom-1 left-1/2 z-20 flex -translate-x-1/2 items-center gap-0.5 rounded-full px-1.5 py-0.5 font-display text-[11px] font-bold tabular-nums leading-none shadow-sm ${
        completed ? 'bg-accent/90 text-felt-deep' : 'bg-black/75 text-ink'
      }`}
      aria-label={`${count} cards`}
    >
      {count}
    </div>
  )
}

function BookChip({
  book,
}: {
  book: Book
}) {
  const completed = book.cards.length >= 7
  const clean = isCleanBook(book)
  const wilds = bookWildCount(book)

  return (
    <div
      className={`book-chip relative ${completed ? 'book-chip-complete' : ''} ${clean ? 'book-chip-clean' : wilds > 0 ? 'book-chip-dirty' : ''}`}
      title={`${book.rank}s · ${book.cards.length} cards${clean ? ' · clean' : wilds > 0 ? ' · dirty' : ''}`}
    >
      <span
        data-flight-anchor={`book-${book.id}`}
        className="pointer-events-none absolute left-1/2 top-1/2 z-0 h-0 w-0 -translate-x-1/2 -translate-y-1/2"
        aria-hidden
      />
      <span className="book-chip-rank">{book.rank}</span>
      <span className="book-chip-count">{book.cards.length}</span>
      {completed && <BookStatusMark clean={clean} />}
      {!clean && wilds > 0 && <WildCountBadge count={wilds} />}
    </div>
  )
}

function BookDisplay({
  book,
  getCardMotion,
  isCardHidden,
  mobile = false,
}: {
  book: Book
  getCardMotion?: (cardId: string) => CardMotionKind | undefined
  isCardHidden?: (cardId: string) => boolean
  mobile?: boolean
}) {
  if (mobile) {
    return <BookChip book={book} />
  }

  const completed = book.cards.length >= 7
  const clean = isCleanBook(book)
  const wilds = bookWildCount(book)
  const fanCards = cardsForBookFan(book.cards)
  const layout = cardFanLayout(fanCards.length, { small: true, stacked: completed })
  const landingIndex = Math.max(0, Math.floor((fanCards.length - 1) / 2))
  const landing = { x: layout.fanWidth / 2, y: layout.cardHeight / 2 }

  return (
    <div
      className={`relative shrink-0 pb-2 ${completed ? 'animate-book-settle' : ''}`}
      title={`${book.rank}s · ${book.cards.length} cards${clean ? ' · clean' : wilds > 0 ? ' · dirty' : ''}`}
    >
      {completed && (
        <div className="absolute -right-0.5 top-0 z-20 rounded bg-black/55 px-1 py-0.5 backdrop-blur-sm">
          <BookStatusMark clean={clean} />
        </div>
      )}
      {!clean && wilds > 0 && (
        <div className="absolute -left-0.5 top-0 z-20">
          <WildCountBadge count={wilds} />
        </div>
      )}
      <div className="relative transition-transform duration-200 ease-settle hover:-translate-y-0.5">
        <span
          data-flight-anchor={`book-${book.id}`}
          data-flight-rotation={layout.rotation(landingIndex)}
          className="pointer-events-none absolute z-0 h-0 w-0"
          style={{ left: landing.x, top: landing.y }}
          aria-hidden
        />
        <CardFan
          cards={fanCards}
          small
          stacked={completed}
          animate={completed}
          getCardMotion={getCardMotion}
          isCardHidden={isCardHidden}
        />
      </div>
      <BookCountBadge count={book.cards.length} completed={completed} />
      <p className="mt-1 text-center font-sans text-[10px] font-medium tabular-nums text-ink-muted">
        {book.rank}
      </p>
    </div>
  )
}

export function TeamBooks({
  books,
  teamId,
  highlightTeamId,
  compact = false,
  mobile = false,
  label,
  getCardMotion,
  isCardHidden,
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
          <BookDisplay
            key={book.id}
            book={book}
            mobile={mobile}
            getCardMotion={getCardMotion}
            isCardHidden={isCardHidden}
          />
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
          <BookDisplay
            key={book.id}
            book={book}
            mobile={mobile}
            getCardMotion={getCardMotion}
            isCardHidden={isCardHidden}
          />
        ))}
      </div>
      {highlighted && <span className="sr-only">Your team</span>}
    </div>
  )
}

/** Harmonious on-felt book placement — wraps naturally, never scrolls. */
export function TableBookZone({
  books,
  teamId,
  seatIndex,
  side,
  myTeamId,
  mobile = false,
  getCardMotion,
  isCardHidden,
}: {
  books: Book[]
  teamId: number
  seatIndex: number
  side: CompassSide
  myTeamId: number
  mobile?: boolean
  getCardMotion?: (cardId: string) => CardMotionKind | undefined
  isCardHidden?: (cardId: string) => boolean
}) {
  const playerBooks = books.filter((b) => b.teamId === teamId)
  if (playerBooks.length === 0) return null

  const zoneClass = tableBookZoneClass(side)

  return (
    <div
      className={`pointer-events-none absolute z-[15] ${zoneClass}`}
      data-flight-anchor={`books-${seatIndex}`}
    >
      <div className={`flex ${tableBookFlexClass(side, mobile)}`}>
        <TeamBooks
          books={playerBooks}
          teamId={teamId}
          highlightTeamId={myTeamId}
          compact
          mobile={mobile}
          getCardMotion={getCardMotion}
          isCardHidden={isCardHidden}
        />
      </div>
    </div>
  )
}

function tableBookZoneClass(side: CompassSide): string {
  switch (side) {
    case 'north':
      return 'left-1/2 top-[12%] w-[min(82%,44rem)] -translate-x-1/2'
    case 'south':
      return 'bottom-[12%] left-1/2 w-[min(82%,44rem)] -translate-x-1/2'
    case 'west':
      return 'left-[15%] top-1/2 w-[min(32%,14rem)] -translate-y-1/2'
    case 'east':
      return 'right-[15%] top-1/2 w-[min(32%,14rem)] -translate-y-1/2'
    case 'nw':
      return 'left-[14%] top-[14%] w-[min(36%,16rem)]'
    case 'ne':
      return 'right-[14%] top-[14%] w-[min(36%,16rem)]'
    case 'sw':
      return 'bottom-[14%] left-[14%] w-[min(36%,16rem)]'
    case 'se':
      return 'bottom-[14%] right-[14%] w-[min(36%,16rem)]'
    default:
      return 'left-1/2 top-[12%] -translate-x-1/2'
  }
}

function tableBookFlexClass(side: CompassSide, mobile = false): string {
  const gap = mobile ? 'gap-x-1 gap-y-1' : 'gap-x-2.5 gap-y-2'
  switch (side) {
    case 'north':
      return `flex-row flex-wrap items-end justify-center ${gap}`
    case 'south':
      return `flex-row flex-wrap items-start justify-center ${gap}`
    case 'west':
      return `flex-row flex-wrap items-center justify-start ${gap}`
    case 'east':
      return `flex-row-reverse flex-wrap items-center justify-start ${gap}`
    case 'nw':
      return `flex-row flex-wrap items-end justify-start ${gap}`
    case 'ne':
      return `flex-row-reverse flex-wrap items-end justify-end ${gap}`
    case 'sw':
      return `flex-row flex-wrap items-start justify-start ${gap}`
    case 'se':
      return `flex-row-reverse flex-wrap items-start justify-end ${gap}`
    default:
      return `flex-row flex-wrap justify-center ${gap}`
  }
}
