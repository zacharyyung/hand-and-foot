export type FlightAnchor =
  | 'hand'
  | 'staging'
  | 'stock'
  | 'discard'
  | `seat-${number}`
  | `books-${number}`
  | `book-${string}`
  | `hand-${string}`
  | `staging-${string}`

export interface AnchorPoint {
  x: number
  y: number
  rotation?: number
}

export function seatFlightAnchor(seatIndex: number): FlightAnchor {
  return `seat-${seatIndex}`
}

export function booksFlightAnchor(seatIndex: number): FlightAnchor {
  return `books-${seatIndex}`
}

export function bookFlightAnchor(bookId: string): FlightAnchor {
  return `book-${bookId}`
}

export function handFlightAnchor(cardId: string): FlightAnchor {
  return `hand-${cardId}`
}

export function stagingBookAnchor(stagedBookId: string): FlightAnchor {
  return `staging-${stagedBookId}`
}

export function getAnchorPoint(name: FlightAnchor): AnchorPoint | null {
  const el = document.querySelector(`[data-flight-anchor="${name}"]`)
  if (!el) return null
  const rect = el.getBoundingClientRect()
  const rotationRaw = el.getAttribute('data-flight-rotation')
  const rotation = rotationRaw ? Number(rotationRaw) : undefined
  if (rect.width === 0 && rect.height === 0) {
    return { x: rect.left, y: rect.top, rotation }
  }
  return {
    x: rect.left + rect.width / 2,
    y: rect.top + rect.height / 2,
    rotation,
  }
}

/** @deprecated Use getAnchorPoint */
export function getAnchorCenter(name: FlightAnchor): { x: number; y: number } | null {
  const point = getAnchorPoint(name)
  if (!point) return null
  return { x: point.x, y: point.y }
}

export function prefersReducedCardMotion(): boolean {
  if (typeof window === 'undefined') return false
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}
