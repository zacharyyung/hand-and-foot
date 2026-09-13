/**
 * Pixel sizes for card tiers — keep Card.tsx Tailwind classes,
 * fan layouts, pile shells, and on-felt books in sync with these values.
 *
 * South hand, stock/discard, and table books share:
 *   mobile → tiny · desktop → small
 * Staging chips stay on micro.
 */
export const CARD_SIZE_PX = {
  /** Staging chips only */
  micro: { w: 30, h: 46 },
  /** South hand + stock/discard + on-felt books (phone) */
  tiny: { w: 40, h: 60 },
  /** South hand + stock/discard + on-felt books (desktop) */
  small: { w: 46, h: 66 },
  large: { w: 64, h: 96 },
} as const

/** Rem sizes matching CARD_SIZE_PX — used by on-felt book CSS vars. */
export const CARD_SIZE_REM = {
  micro: { w: '1.875rem', h: '2.875rem' },
  tiny: { w: '2.5rem', h: '3.75rem' },
  small: { w: '2.85rem', h: '4.1rem' },
  large: { w: '4rem', h: '6rem' },
} as const

/** Tailwind size classes for each face/back shell. */
export const CARD_SIZE_CLASS = {
  micro: 'h-[2.875rem] w-[1.875rem] text-[7px]',
  tiny: 'h-[3.75rem] w-10 text-[9px]',
  small: 'h-[4.1rem] w-[2.85rem] text-[11px] sm:h-16 sm:w-11 sm:text-xs',
  large: 'h-24 w-16 text-sm',
} as const
