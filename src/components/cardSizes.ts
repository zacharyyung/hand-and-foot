/**
 * Pixel sizes for card tiers — keep Card.tsx Tailwind classes,
 * fan layouts, and pile shells in sync with these values.
 */
export const CARD_SIZE_PX = {
  /** Book / staging chips on phone */
  micro: { w: 30, h: 46 },
  /** Player hand + piles on phone */
  tiny: { w: 40, h: 60 },
  small: { w: 46, h: 66 },
  large: { w: 64, h: 96 },
} as const

/** Tailwind size classes for each face/back shell. */
export const CARD_SIZE_CLASS = {
  micro: 'h-[2.875rem] w-[1.875rem] text-[7px]',
  tiny: 'h-[3.75rem] w-10 text-[9px]',
  small: 'h-[4.1rem] w-[2.85rem] text-[11px] sm:h-16 sm:w-11 sm:text-xs',
  large: 'h-24 w-16 text-sm',
} as const
