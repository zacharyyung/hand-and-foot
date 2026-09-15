import type { Book } from '../game/books'
import type { CardMotionKind } from '../game/cardMotion'
import { bookWildCount, cardsForBookFan, isCleanBook, sortBooks } from '../game/books'
import { WILD_TEXT_CLASS, WILD_RING_CLASS } from './Card'
import { CardFan } from './CardFan'
import { BookMini } from './BookMini'
import { cardFanLayout } from './cardFanLayout'
import type { CompassSide } from '../game/tableLayout'
import { TEAM_COLORS } from '../game/teams'
import { DirtyBookConsentPrompt, type DirtyBookConsent } from './DirtyBookConsentPrompt'
import {
  DirtyBookWarningPrompt,
  type DirtyBookSelfWarning,
} from './DirtyBookWarningPrompt'

interface TeamBooksProps {
  books: Book[]
  teamId: number
  highlightTeamId?: number
  compact?: boolean
  /** Compact mini-card books instead of full fans (phone layouts). */
  mobile?: boolean
  /** Felt seat side — used to place the wild-consent popup beside the book. */
  side?: CompassSide
  label?: string
  getCardMotion?: (cardId: string) => CardMotionKind | undefined
  isCardHidden?: (cardId: string) => boolean
  dirtyBookConsent?: DirtyBookConsent | null
  dirtyBookWarning?: DirtyBookSelfWarning | null
}

function WildCountBadge({ count }: { count: number }) {
  const atMax = count >= 2
  return (
    <span
      className={`flex h-4 min-w-4 items-center justify-center rounded-full px-0.5 text-[8px] font-bold leading-none ring-1 ${
        atMax
          ? 'wild-count-badge-full bg-red-950/90 text-red-200 ring-red-400/55'
          : `bg-black/75 ${WILD_TEXT_CLASS} ${WILD_RING_CLASS}`
      }`}
      aria-label={`${count} wild card${count === 1 ? '' : 's'}${atMax ? ' (maximum)' : ''}`}
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

function BookDisplay({
  book,
  getCardMotion,
  isCardHidden,
  mobile = false,
  /** Phone layout → tiny cards; desktop → small (match south hand). */
  layoutMobile = false,
  side,
  dirtyBookConsent = null,
  dirtyBookWarning = null,
}: {
  book: Book
  getCardMotion?: (cardId: string) => CardMotionKind | undefined
  isCardHidden?: (cardId: string) => boolean
  mobile?: boolean
  layoutMobile?: boolean
  side?: CompassSide
  dirtyBookConsent?: DirtyBookConsent | null
  dirtyBookWarning?: DirtyBookSelfWarning | null
}) {
  const completed = book.cards.length >= 7
  const clean = isCleanBook(book)
  const wilds = bookWildCount(book)
  const showConsent = dirtyBookConsent?.bookId === book.id
  const showWarning = dirtyBookWarning?.bookId === book.id
  const showPrompt = showConsent || showWarning
  const promptRing = showConsent
    ? mobile
      ? 'z-40 rounded-lg ring-2 ring-amber-400/70 ring-offset-1 ring-offset-transparent'
      : 'z-40 rounded-lg ring-2 ring-amber-400/70 ring-offset-2 ring-offset-transparent'
    : showWarning
      ? mobile
        ? 'z-40 rounded-lg ring-1 ring-accent/55 ring-offset-1 ring-offset-transparent'
        : 'z-40 rounded-lg ring-1 ring-accent/55 ring-offset-2 ring-offset-transparent'
      : ''

  if (mobile) {
    return (
      <div
        data-book-prompt-anchor={showPrompt ? book.id : undefined}
        className={`relative shrink-0 ${promptRing}`}
      >
        <BookMini
          cards={book.cards}
          bookId={book.id}
          completed={completed}
          clean={clean}
          wildCount={wilds}
          tiny={layoutMobile}
          small={!layoutMobile}
          getCardMotion={getCardMotion}
          isCardHidden={isCardHidden}
        />
        {showConsent && dirtyBookConsent && (
          <DirtyBookConsentPrompt
            book={book}
            consent={dirtyBookConsent}
            side={side}
            mobile
          />
        )}
        {showWarning && dirtyBookWarning && (
          <DirtyBookWarningPrompt
            book={book}
            warning={dirtyBookWarning}
            side={side}
            mobile
          />
        )}
      </div>
    )
  }

  const fanCards = cardsForBookFan(book.cards)
  const layout = cardFanLayout(fanCards.length, { small: true, stacked: completed })
  const landingIndex = Math.max(0, Math.floor((fanCards.length - 1) / 2))
  const landing = { x: layout.fanWidth / 2, y: layout.cardHeight / 2 }

  return (
    <div
      data-book-prompt-anchor={showPrompt ? book.id : undefined}
      className={`relative shrink-0 pb-2 ${completed ? 'animate-book-settle' : ''} ${promptRing}`}
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
      {showConsent && dirtyBookConsent && (
        <DirtyBookConsentPrompt
          book={book}
          consent={dirtyBookConsent}
          side={side}
        />
      )}
      {showWarning && dirtyBookWarning && (
        <DirtyBookWarningPrompt
          book={book}
          warning={dirtyBookWarning}
          side={side}
        />
      )}
    </div>
  )
}

export function TeamBooks({
  books,
  teamId,
  highlightTeamId,
  compact = false,
  mobile = false,
  side,
  label,
  getCardMotion,
  isCardHidden,
  dirtyBookConsent = null,
  dirtyBookWarning = null,
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
    /* On-felt books always use BookMini tiles so up to 9 fit without fan overlap. */
    return (
      <>
        {teamBooks.map((book) => (
          <BookDisplay
            key={book.id}
            book={book}
            mobile
            layoutMobile={mobile}
            side={side}
            getCardMotion={getCardMotion}
            isCardHidden={isCardHidden}
            dirtyBookConsent={dirtyBookConsent}
            dirtyBookWarning={dirtyBookWarning}
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
            layoutMobile={mobile}
            side={side}
            getCardMotion={getCardMotion}
            isCardHidden={isCardHidden}
            dirtyBookConsent={dirtyBookConsent}
            dirtyBookWarning={dirtyBookWarning}
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
  dirtyBookConsent = null,
  dirtyBookWarning = null,
}: {
  books: Book[]
  teamId: number
  seatIndex: number
  side: CompassSide
  myTeamId: number
  mobile?: boolean
  getCardMotion?: (cardId: string) => CardMotionKind | undefined
  isCardHidden?: (cardId: string) => boolean
  dirtyBookConsent?: DirtyBookConsent | null
  dirtyBookWarning?: DirtyBookSelfWarning | null
}) {
  const playerBooks = books.filter((b) => b.teamId === teamId)
  if (playerBooks.length === 0) return null

  const bookCount = playerBooks.length
  const zoneClass = tableBookZoneClass(side, mobile, bookCount)
  const flexClass = tableBookFlexClass(side, mobile, bookCount)

  const hasPromptTarget =
    (dirtyBookConsent != null &&
      playerBooks.some((book) => book.id === dirtyBookConsent.bookId)) ||
    (dirtyBookWarning != null &&
      playerBooks.some((book) => book.id === dirtyBookWarning.bookId))

  return (
    <div
      className={`pointer-events-none absolute ${hasPromptTarget ? 'z-40' : 'z-[15]'} ${zoneClass}`}
      data-flight-anchor={`books-${seatIndex}`}
      data-book-count={bookCount}
      data-book-side={side}
    >
      <div className={flexClass}>
        <TeamBooks
          books={playerBooks}
          teamId={teamId}
          highlightTeamId={myTeamId}
          compact
          mobile={mobile}
          side={side}
          getCardMotion={getCardMotion}
          isCardHidden={isCardHidden}
          dirtyBookConsent={dirtyBookConsent}
          dirtyBookWarning={dirtyBookWarning}
        />
      </div>
    </div>
  )
}

function tableBookDensityClass(bookCount: number): string {
  if (bookCount >= 9) return ' table-book-zone-xdense'
  if (bookCount >= 7) return ' table-book-zone-dense'
  if (bookCount >= 5) return ' table-book-zone-compact'
  return ''
}

/**
 * On-felt book bands — shrink-wrapped clusters owned by each seat.
 * Zones sit inside `.round-table-books` (already inset from the brown rail),
 * so percentages are felt-inner — never shell-relative. Parent overflow clips
 * any spill. Up to 9 BookMini tiles: 3×3 north/south; 2×5 or 3×3 on sides.
 */
function tableBookZoneClass(
  side: CompassSide,
  mobile = false,
  bookCount = 0,
): string {
  const dense = tableBookDensityClass(bookCount)
  const sideWide = bookCount >= 7

  if (mobile) {
    const sideW = sideWide ? 'w-[8.25rem]' : 'w-[5.75rem]'
    /* Positions relative to the inset books frame — flush to its edges is OK. */
    switch (side) {
      case 'north':
        return `table-book-zone table-book-zone-north left-1/2 top-0 w-fit max-w-[min(92%,16rem)] -translate-x-1/2${dense}`
      case 'south':
        return `table-book-zone table-book-zone-south bottom-0 left-1/2 w-fit max-w-[min(92%,16rem)] -translate-x-1/2${dense}`
      case 'west':
        return `table-book-zone table-book-zone-side table-book-zone-west left-0 top-1/2 ${sideW} max-h-[72%] -translate-y-1/2${dense}`
      case 'east':
        return `table-book-zone table-book-zone-side table-book-zone-east right-0 top-1/2 ${sideW} max-h-[72%] -translate-y-1/2${dense}`
      case 'nw':
        return `table-book-zone table-book-zone-side table-book-zone-west left-0 top-[6%] ${sideW}${dense}`
      case 'ne':
        return `table-book-zone table-book-zone-side table-book-zone-east right-0 top-[6%] ${sideW}${dense}`
      case 'sw':
        return `table-book-zone table-book-zone-side table-book-zone-west left-0 bottom-[8%] ${sideW}${dense}`
      case 'se':
        return `table-book-zone table-book-zone-side table-book-zone-east right-0 bottom-[8%] ${sideW}${dense}`
      default:
        return `table-book-zone table-book-zone-north left-1/2 top-0 w-fit max-w-[min(92%,16rem)] -translate-x-1/2${dense}`
    }
  }

  const deskSideW = sideWide ? 'w-[min(9.25rem,24%)]' : 'w-[min(6.75rem,20%)]'
  switch (side) {
    case 'north':
      return `table-book-zone table-book-zone-north left-1/2 top-0 w-fit max-w-[min(84%,32rem)] -translate-x-1/2${dense}`
    case 'south':
      return `table-book-zone table-book-zone-south bottom-0 left-1/2 w-fit max-w-[min(84%,32rem)] -translate-x-1/2${dense}`
    case 'west':
      return `table-book-zone table-book-zone-side table-book-zone-west left-0 top-1/2 ${deskSideW} max-h-[70%] -translate-y-1/2${dense}`
    case 'east':
      return `table-book-zone table-book-zone-side table-book-zone-east right-0 top-1/2 ${deskSideW} max-h-[70%] -translate-y-1/2${dense}`
    case 'nw':
      return `table-book-zone table-book-zone-side table-book-zone-west left-0 top-[4%] ${deskSideW}${dense}`
    case 'ne':
      return `table-book-zone table-book-zone-side table-book-zone-east right-0 top-[4%] ${deskSideW}${dense}`
    case 'sw':
      return `table-book-zone table-book-zone-side table-book-zone-west left-0 bottom-[6%] ${deskSideW}${dense}`
    case 'se':
      return `table-book-zone table-book-zone-side table-book-zone-east right-0 bottom-[6%] ${deskSideW}${dense}`
    default:
      return `table-book-zone table-book-zone-north left-1/2 top-0 w-fit max-w-[min(84%,32rem)] -translate-x-1/2${dense}`
  }
}

function tableBookFlexClass(
  side: CompassSide,
  _mobile = false,
  bookCount = 0,
): string {
  /* Tight chip-cluster gaps — readable as one group under/beside the seat. */
  const gap =
    bookCount >= 9
      ? 'gap-x-0.5 gap-y-0.5'
      : bookCount >= 7
        ? 'gap-x-0.5 gap-y-1'
        : bookCount >= 5
          ? 'gap-x-1 gap-y-1'
          : bookCount >= 3
            ? 'gap-x-1 gap-y-1'
            : 'gap-x-1.5 gap-y-1'

  const isWestSide = side === 'west' || side === 'nw' || side === 'sw'
  const isEastSide = side === 'east' || side === 'ne' || side === 'se'

  if (isWestSide || isEastSide) {
    const cols = bookCount >= 7 ? 'grid-cols-3' : 'grid-cols-2'
    const align = isWestSide ? 'justify-items-start' : 'justify-items-end'
    return `table-book-grid table-book-side-grid grid ${cols} ${gap} content-start items-start ${align}`
  }

  /*
   * North/south: shrink-wrapped flex for ≤3 books; 4–9 use a 3-column grid
   * so tiles never pile into one overlapping row.
   */
  if (bookCount <= 3) {
    switch (side) {
      case 'north':
        return `table-book-grid table-book-ns-grid flex w-fit flex-row flex-wrap items-end justify-center ${gap}`
      case 'south':
        return `table-book-grid table-book-ns-grid flex w-fit flex-row flex-wrap items-start justify-center ${gap}`
      default:
        return `table-book-grid table-book-ns-grid flex w-fit flex-row flex-wrap justify-center ${gap}`
    }
  }

  return `table-book-grid table-book-ns-grid grid grid-cols-3 ${gap} justify-items-center content-start`
}
