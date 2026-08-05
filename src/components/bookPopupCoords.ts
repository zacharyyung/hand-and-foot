import type { CompassSide } from '../game/tableLayout'

export const BOOK_POPUP_GAP = 8
export const BOOK_POPUP_VIEWPORT_PAD = 8

export type BookPopupCoords = { top: number; left: number; place: 'right' | 'left' }

export function preferBookPopupRight(side?: CompassSide): boolean {
  return side !== 'east' && side !== 'ne' && side !== 'se'
}

export function computeBookPopupCoords(
  anchor: DOMRect,
  side: CompassSide | undefined,
  popupWidth: number,
  estimatedHeight: number,
): BookPopupCoords {
  const preferRightSide = preferBookPopupRight(side)
  const spaceRight = window.innerWidth - anchor.right - BOOK_POPUP_VIEWPORT_PAD
  const spaceLeft = anchor.left - BOOK_POPUP_VIEWPORT_PAD

  let place: 'right' | 'left'
  if (preferRightSide) {
    place = spaceRight >= popupWidth || spaceRight >= spaceLeft ? 'right' : 'left'
  } else {
    place = spaceLeft >= popupWidth || spaceLeft >= spaceRight ? 'left' : 'right'
  }

  const rawLeft =
    place === 'right'
      ? anchor.right + BOOK_POPUP_GAP
      : anchor.left - BOOK_POPUP_GAP - popupWidth
  const left = Math.max(
    BOOK_POPUP_VIEWPORT_PAD,
    Math.min(rawLeft, window.innerWidth - popupWidth - BOOK_POPUP_VIEWPORT_PAD),
  )

  // Keep the popup near the book face, not covering the count badges under it.
  const rawTop = anchor.top + Math.max(0, (anchor.height - estimatedHeight) / 2)
  const top = Math.max(
    BOOK_POPUP_VIEWPORT_PAD,
    Math.min(rawTop, window.innerHeight - estimatedHeight - BOOK_POPUP_VIEWPORT_PAD),
  )

  return { top, left, place }
}

export function fallbackBookPopupCoords(
  side: CompassSide | undefined,
  popupWidth: number,
): BookPopupCoords {
  const place = preferBookPopupRight(side) ? 'right' : 'left'
  return {
    top: Math.max(BOOK_POPUP_VIEWPORT_PAD, Math.round(window.innerHeight * 0.28)),
    left: Math.max(
      BOOK_POPUP_VIEWPORT_PAD,
      Math.min(
        Math.round((window.innerWidth - popupWidth) / 2),
        window.innerWidth - popupWidth - BOOK_POPUP_VIEWPORT_PAD,
      ),
    ),
    place,
  }
}
