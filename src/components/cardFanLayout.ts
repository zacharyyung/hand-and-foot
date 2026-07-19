import type { Card as CardType } from '../game/cards'

/** Deterministic ±2° tilt so stacked cards feel physical, not grid-perfect. */
export function stackRotationDeg(seed: string, index = 0): number {
  let hash = index * 17
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) | 0
  }
  return (Math.abs(hash) % 401) / 100 - 2
}

export interface CardFanLayout {
  cardWidth: number
  cardHeight: number
  step: number
  fanWidth: number
  rotation: (index: number, cardId?: string) => number
  slotCenter: (index: number) => { x: number; y: number }
}

export function cardFanLayout(
  cardCount: number,
  options: { small?: boolean; tiny?: boolean; micro?: boolean; stacked?: boolean; peek?: number } = {},
): CardFanLayout {
  const { small = true, tiny = false, micro = false, stacked = false, peek } = options
  const cardWidth = micro ? 21 : tiny ? 30 : small ? 44 : 64
  const cardHeight = micro ? 32 : tiny ? 44 : small ? 64 : 96
  const step = stacked
    ? micro
      ? 1.5
      : tiny
        ? 2
        : 2.5
    : peek ??
      Math.max(
        micro ? 3 : tiny ? 4 : 7,
        Math.min(
          micro ? 5 : tiny ? 8 : small ? 13 : 17,
          Math.floor((micro ? 24 : tiny ? 36 : 52) / Math.max(cardCount, 1)),
        ),
      )
  const fanWidth = cardWidth + Math.max(0, cardCount - 1) * step

  return {
    cardWidth,
    cardHeight,
    step,
    fanWidth,
    rotation: (index: number, cardId?: string) =>
      stacked
        ? stackRotationDeg(cardId ?? `stack-${index}`, index)
        : (index - (cardCount - 1) / 2) * (micro ? 0.35 : tiny ? 0.4 : 0.6),
    slotCenter: (index: number) => ({
      x: index * step + cardWidth / 2,
      y: cardHeight / 2,
    }),
  }
}

/** Screen-local fan coords for where an incoming stack should land. */
export function bookFanFlightCenter(
  totalCardCount: number,
  incomingCardCount: number,
  options: { small?: boolean; tiny?: boolean; micro?: boolean; stacked?: boolean } = {},
): { x: number; y: number; rotation: number } {
  const layout = cardFanLayout(totalCardCount, options)
  const incomingLayout = cardFanLayout(incomingCardCount, options)

  if (incomingCardCount >= totalCardCount) {
    const centerIndex = Math.max(0, Math.floor((totalCardCount - 1) / 2))
    return {
      x: layout.fanWidth / 2,
      y: layout.cardHeight / 2,
      rotation: layout.rotation(centerIndex),
    }
  }

  const startIndex = totalCardCount - incomingCardCount
  const centerIndex = Math.max(0, Math.floor((incomingCardCount - 1) / 2))
  return {
    x: startIndex * layout.step + incomingLayout.fanWidth / 2,
    y: layout.cardHeight / 2,
    rotation: layout.rotation(startIndex + centerIndex),
  }
}

export type FanCard = CardType
