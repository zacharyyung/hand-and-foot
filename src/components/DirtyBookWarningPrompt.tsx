import { useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { Book } from '../game/books'
import { isCleanBook } from '../game/books'
import type { CompassSide } from '../game/tableLayout'
import {
  computeBookPopupCoords,
  fallbackBookPopupCoords,
  type BookPopupCoords,
} from './bookPopupCoords'

export interface DirtyBookSelfWarning {
  bookId: string
  bookRank: string
  onConfirm: () => void
  onCancel: () => void
}

interface DirtyBookWarningPromptProps {
  book: Book
  warning: DirtyBookSelfWarning
  /** Seat side of the book zone — used to prefer an inward popup placement. */
  side?: CompassSide
  mobile?: boolean
}

const POPUP_WIDTH = 200
const ESTIMATED_HEIGHT = 118

/** Quiet confirm popup beside a clean book when you try to add a wild. */
export function DirtyBookWarningPrompt({
  book,
  warning,
  side,
  mobile = false,
}: DirtyBookWarningPromptProps) {
  const completed = book.cards.length >= 7
  const clean = isCleanBook(book)
  const countLabel = `${book.cards.length} card${book.cards.length === 1 ? '' : 's'}`
  const statusLabel = completed ? (clean ? 'clean' : 'dirty') : clean ? 'clean' : 'dirty'
  const hostRef = useRef<HTMLSpanElement>(null)
  const [coords, setCoords] = useState<BookPopupCoords>(() =>
    fallbackBookPopupCoords(side, POPUP_WIDTH),
  )

  useLayoutEffect(() => {
    const host = hostRef.current
    if (!host) {
      setCoords(fallbackBookPopupCoords(side, POPUP_WIDTH))
      return
    }

    function update() {
      const bookEl = host?.closest('[data-book-prompt-anchor]') as HTMLElement | null
      const rect = (bookEl ?? host)?.getBoundingClientRect()
      if (!rect || rect.width === 0) {
        setCoords(fallbackBookPopupCoords(side, POPUP_WIDTH))
        return
      }
      setCoords(computeBookPopupCoords(rect, side, POPUP_WIDTH, ESTIMATED_HEIGHT))
    }

    update()
    window.addEventListener('resize', update)
    window.addEventListener('scroll', update, true)
    return () => {
      window.removeEventListener('resize', update)
      window.removeEventListener('scroll', update, true)
    }
  }, [side, book.id, book.cards.length])

  const popup = (
    <div
      className={`pointer-events-auto fixed z-[80] animate-fade-up rounded-xl border border-white/12 bg-felt-dark px-3 py-2.5 shadow-xl ${
        mobile ? 'w-[12.5rem]' : 'w-[12.5rem]'
      }`}
      style={{
        top: coords.top,
        left: coords.left,
        width: POPUP_WIDTH,
      }}
      role="dialog"
      aria-label={`Confirm adding a wild to clean ${book.rank}s book`}
    >
      <div
        className={`absolute top-1/2 h-2.5 w-2.5 -translate-y-1/2 rotate-45 border-white/12 bg-felt-dark ${
          coords.place === 'right'
            ? '-left-1.5 border-b-0 border-r-0 border-l border-t'
            : '-right-1.5 border-l-0 border-t-0 border-b border-r'
        }`}
        aria-hidden
      />
      <p className="text-[12px] font-medium leading-snug text-ink-soft">
        Add a wild to your clean{' '}
        <span className="font-semibold text-accent">{warning.bookRank}s</span> book?
        That makes it dirty.
      </p>
      <p className="mt-1 text-[10px] leading-snug text-ink-muted">
        {countLabel} · still {statusLabel} — wild not placed yet
      </p>
      <div className="mt-2.5 flex gap-1.5">
        <button
          type="button"
          onClick={warning.onCancel}
          className="btn-secondary min-h-0 flex-1 px-1.5 py-1.5 text-[11px] leading-none"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={warning.onConfirm}
          className="btn-danger min-h-0 flex-1 px-1.5 py-1.5 text-[11px] leading-none"
        >
          Add wild
        </button>
      </div>
    </div>
  )

  return (
    <>
      <span ref={hostRef} className="pointer-events-none absolute inset-0" aria-hidden />
      {createPortal(popup, document.body)}
    </>
  )
}
