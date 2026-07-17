import type { Card as CardType } from '../game/cards'

export interface CardFanLayout {
  cardWidth: number
  cardHeight: number
  step: number
  fanWidth: number
  rotation: (index: number) => number
  slotCenter: (index: number) => { x: number; y: number }
}

export function cardFanLayout(
  cardCount: number,
  options: { small?: boolean; tiny?: boolean; stacked?: boolean; peek?: number } = {},
): CardFanLayout {
  const { small = true, tiny = false, stacked = false, peek } = options
  const cardWidth = tiny ? 30 : small ? 44 : 64
  const cardHeight = tiny ? 44 : small ? 64 : 96
  const step = stacked
    ? tiny
      ? 2
      : 2.5
    : peek ??
      Math.max(
        tiny ? 4 : 7,
        Math.min(tiny ? 8 : small ? 13 : 17, Math.floor((tiny ? 36 : 52) / Math.max(cardCount, 1))),
      )
  const fanWidth = cardWidth + Math.max(0, cardCount - 1) * step

  return {
    cardWidth,
    cardHeight,
    step,
    fanWidth,
    rotation: (index: number) =>
      stacked ? 0 : (index - (cardCount - 1) / 2) * (tiny ? 0.4 : 0.6),
    slotCenter: (index: number) => ({
      x: index * step + cardWidth / 2,
      y: cardHeight / 2,
    }),
  }
}

export type FanCard = CardType
