/**
 * Pixel sizes for card tiers — keep Card.tsx Tailwind classes,
 * fan layouts, and pile shells in sync with these values.
 */
export const CARD_SIZE_PX = {
  micro: { w: 26, h: 40 },
  tiny: { w: 34, h: 52 },
  small: { w: 46, h: 66 },
  large: { w: 64, h: 96 },
} as const

/** Tailwind size classes for each face/back shell. */
export const CARD_SIZE_CLASS = {
  micro: 'h-10 w-[1.625rem] text-[6px]',
  tiny: 'h-[3.25rem] w-[2.125rem] text-[8px]',
  small: 'h-[4.1rem] w-[2.85rem] text-[11px] sm:h-16 sm:w-11 sm:text-xs',
  large: 'h-24 w-16 text-sm',
} as const
