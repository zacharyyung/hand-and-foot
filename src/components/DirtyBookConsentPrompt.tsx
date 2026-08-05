import { useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { Book } from '../game/books'
import { isCleanBook } from '../game/books'
import type { CompassSide } from '../game/tableLayout'

export interface DirtyBookConsent {
  bookId: string
  partnerName: string
  partnerAvatar: string
  askText: string
  onApprove: () => void
  onDeny: () => void
}

interface DirtyBookConsentPromptProps {
  book: Book
  consent: DirtyBookConsent
  /** Seat side of the book zone — used to prefer an inward popup placement. */
  side?: CompassSide
  mobile?: boolean
}

const POPUP_WIDTH = 168
const POPUP_GAP = 8
const VIEWPORT_PAD = 8

type PopupCoords = { top: number; left: number; place: 'right' | 'left' }

function preferRight(side?: CompassSide): boolean {
  return side !== 'east' && side !== 'ne' && side !== 'se'
}

function computePopupCoords(
  anchor: DOMRect,
  side: CompassSide | undefined,
): PopupCoords {
  const preferRightSide = preferRight(side)
  const spaceRight = window.innerWidth - anchor.right - VIEWPORT_PAD
  const spaceLeft = anchor.left - VIEWPORT_PAD

  let place: 'right' | 'left'
  if (preferRightSide) {
    place = spaceRight >= POPUP_WIDTH || spaceRight >= spaceLeft ? 'right' : 'left'
  } else {
    place = spaceLeft >= POPUP_WIDTH || spaceLeft >= spaceRight ? 'left' : 'right'
  }

  const rawLeft =
    place === 'right' ? anchor.right + POPUP_GAP : anchor.left - POPUP_GAP - POPUP_WIDTH
  const left = Math.max(
    VIEWPORT_PAD,
    Math.min(rawLeft, window.innerWidth - POPUP_WIDTH - VIEWPORT_PAD),
  )

  // Keep the popup near the book face, not covering the count badges under it.
  const estimatedHeight = 128
  const rawTop = anchor.top + Math.max(0, (anchor.height - estimatedHeight) / 2)
  const top = Math.max(
    VIEWPORT_PAD,
    Math.min(rawTop, window.innerHeight - estimatedHeight - VIEWPORT_PAD),
  )

  return { top, left, place }
}

function fallbackCoords(side?: CompassSide): PopupCoords {
  const place = preferRight(side) ? 'right' : 'left'
  return {
    top: Math.max(VIEWPORT_PAD, Math.round(window.innerHeight * 0.28)),
    left: Math.max(
      VIEWPORT_PAD,
      Math.min(
        Math.round((window.innerWidth - POPUP_WIDTH) / 2),
        window.innerWidth - POPUP_WIDTH - VIEWPORT_PAD,
      ),
    ),
    place,
  }
}

/** Small yes/no popup anchored beside a book so the player can see card counts. */
export function DirtyBookConsentPrompt({
  book,
  consent,
  side,
  mobile = false,
}: DirtyBookConsentPromptProps) {
  const completed = book.cards.length >= 7
  const clean = isCleanBook(book)
  const countLabel = `${book.cards.length} card${book.cards.length === 1 ? '' : 's'}`
  const statusLabel = completed ? (clean ? 'clean' : 'dirty') : clean ? 'clean' : 'dirty'
  const hostRef = useRef<HTMLSpanElement>(null)
  const [coords, setCoords] = useState<PopupCoords>(() => fallbackCoords(side))

  useLayoutEffect(() => {
    const host = hostRef.current
    if (!host) {
      setCoords(fallbackCoords(side))
      return
    }

    function update() {
      const bookEl = host?.closest('[data-book-consent-anchor]') as HTMLElement | null
      const rect = (bookEl ?? host)?.getBoundingClientRect()
      if (!rect || rect.width === 0) {
        setCoords(fallbackCoords(side))
        return
      }
      setCoords(computePopupCoords(rect, side))
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
      className={`dirty-book-consent pointer-events-auto fixed z-[80] animate-fade-up rounded-xl border-2 border-amber-600 px-3 py-2.5 shadow-xl ${
        mobile ? 'w-[10.5rem]' : 'w-[10.5rem]'
      }`}
      style={{
        top: coords.top,
        left: coords.left,
        width: POPUP_WIDTH,
        background: '#fbf7f0',
        color: '#111111',
      }}
      role="dialog"
      aria-label={`Partner wants to add a wild to ${book.rank}s book`}
    >
      <div
        className={`absolute top-1/2 h-2.5 w-2.5 -translate-y-1/2 rotate-45 border-amber-600 ${
          coords.place === 'right'
            ? '-left-1.5 border-b-0 border-r-0 border-l border-t'
            : '-right-1.5 border-l-0 border-t-0 border-b border-r'
        }`}
        style={{ background: '#fbf7f0' }}
        aria-hidden
      />
      <p
        className="text-[12px] font-bold leading-snug"
        style={{ color: '#111111' }}
      >
        <span aria-hidden>{consent.partnerAvatar} </span>
        Add a wild to {book.rank}s?
      </p>
      <p
        className="mt-1 text-[11px] font-semibold leading-snug"
        style={{ color: '#111111' }}
      >
        {countLabel} · still {statusLabel}
        {clean ? ' — wild not placed yet' : ''}
      </p>
      <p
        className="mt-1.5 line-clamp-3 text-[11px] font-medium leading-snug"
        style={{ color: '#1a1a1a' }}
      >
        {consent.askText}
      </p>
      <div className="mt-2.5 flex gap-1.5">
        <button
          type="button"
          onClick={consent.onApprove}
          className="btn-success min-h-0 flex-1 px-1.5 py-2 text-[11px] font-bold leading-none"
        >
          Yes
        </button>
        <button
          type="button"
          onClick={consent.onDeny}
          className="min-h-0 flex-1 rounded-lg px-1.5 py-2 text-[11px] font-bold leading-none transition"
          style={{ background: '#e8e0d4', color: '#111111' }}
        >
          No
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
