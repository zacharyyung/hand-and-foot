import type { Book } from '../game/books'
import { isCleanBook } from '../game/books'

export interface DirtyBookConsent {
  bookId: string
  partnerName: string
  partnerAvatar: string
  onApprove: () => void
  onDeny: () => void
}

interface DirtyBookConsentPromptProps {
  book: Book
  consent: DirtyBookConsent
  mobile?: boolean
}

/** Small yes/no prompt anchored to a book so the player can see card count. */
export function DirtyBookConsentPrompt({
  book,
  consent,
  mobile = false,
}: DirtyBookConsentPromptProps) {
  const completed = book.cards.length >= 7
  const clean = isCleanBook(book)
  const countLabel = `${book.cards.length} card${book.cards.length === 1 ? '' : 's'}`
  const statusLabel = completed ? (clean ? 'clean' : 'dirty') : clean ? 'clean' : 'dirty'

  return (
    <div
      className={`dirty-book-consent pointer-events-auto absolute left-1/2 z-30 w-[max(6.5rem,100%)] -translate-x-1/2 animate-fade-up rounded-lg border border-amber-400/35 bg-gradient-to-b from-[#1a2e24]/98 to-[#0d1812]/99 px-2 py-1.5 shadow-lg backdrop-blur-sm ${
        mobile ? 'top-[calc(100%+0.2rem)]' : 'top-[calc(100%+0.35rem)]'
      }`}
      role="dialog"
      aria-label={`Partner wants to add a wild to ${book.rank}s book`}
    >
      <p className="text-[9px] font-semibold leading-tight text-amber-100">
        <span aria-hidden>{consent.partnerAvatar}</span> Add wild?
      </p>
      <p className="mt-0.5 text-[8px] leading-tight text-ink-muted">
        {countLabel} · {statusLabel}
      </p>
      <div className="mt-1.5 flex gap-1">
        <button
          type="button"
          onClick={consent.onApprove}
          className="btn-success min-h-0 flex-1 px-1.5 py-1 text-[9px] leading-none"
        >
          Yes
        </button>
        <button
          type="button"
          onClick={consent.onDeny}
          className="btn-secondary min-h-0 flex-1 px-1.5 py-1 text-[9px] leading-none"
        >
          No
        </button>
      </div>
    </div>
  )
}
