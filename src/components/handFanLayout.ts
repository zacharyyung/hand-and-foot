/** Shared hand-fan geometry — keep in sync with HandCards rendering. */

import { CARD_SIZE_PX } from './cardSizes'

export interface HandFanSlot {
  left: number
  rotation: number
  arcY: number
}

export interface HandFanLayout {
  lefts: number[]
  fanWidth: number
  maxRot: number
  slots: HandFanSlot[]
}

interface FanGapPlan {
  base: number
  selectedGap: number
  hoverGap: number
}

/**
 * Choose step + selection/hover extras that fit inside maxWidth when provided.
 * Tightens as the hand grows, but keeps a readable peek of each card face.
 */
function planFanGaps(
  count: number,
  selected: boolean[],
  hoverIndex: number | null,
  options?: { mobile?: boolean; maxWidth?: number },
): FanGapPlan {
  const mobile = options?.mobile ?? false
  const cardW = mobile ? CARD_SIZE_PX.tiny.w : CARD_SIZE_PX.small.w
  const gaps = Math.max(count - 1, 0)
  const maxWidth = options?.maxWidth

  /* Comfortable peek of the big rank; hard floor before we lean on CSS scale. */
  const comfortMin = mobile ? 13 : 16
  const comfortMax = mobile ? 22 : 40
  const hardMin = mobile ? 11 : 12

  let selectedGap = mobile ? (count > 14 ? 6 : 9) : count > 18 ? 8 : 14
  let hoverGap = mobile ? 5 : 10

  let selectedExtras = 0
  let hoverExtras = 0
  for (let i = 0; i < gaps; i++) {
    if (selected[i] || selected[i + 1]) selectedExtras++
    if (hoverIndex !== null && (hoverIndex === i || hoverIndex === i + 1)) {
      hoverExtras++
    }
  }

  if (gaps === 0) {
    return { base: 0, selectedGap: 0, hoverGap: 0 }
  }

  if (maxWidth && count > 1) {
    const budget = Math.max(cardW, maxWidth - cardW)

    /* Start from a comfortable even spacing that would fill the dock. */
    let base = Math.max(comfortMin, Math.min(comfortMax, budget / gaps))

    const measure = (b: number, sel: number, hov: number) =>
      gaps * b + selectedExtras * sel + hoverExtras * hov

    let total = measure(base, selectedGap, hoverGap)
    if (total > budget) {
      /* Prefer shrinking selection/hover breathing room before crushing base. */
      selectedGap = mobile ? (count > 12 ? 3 : 5) : count > 16 ? 5 : 8
      hoverGap = mobile ? 3 : 5
      total = measure(base, selectedGap, hoverGap)
    }

    if (total > budget) {
      const extras = selectedExtras * selectedGap + hoverExtras * hoverGap
      base = (budget - extras) / gaps
      if (base < hardMin) {
        base = hardMin
        const extrasBudget = Math.max(0, budget - gaps * hardMin)
        const extrasCount = selectedExtras + hoverExtras
        if (extrasCount > 0) {
          const per = extrasBudget / extrasCount
          selectedGap = Math.min(selectedGap, per)
          hoverGap = Math.min(hoverGap, per)
        } else {
          selectedGap = 0
          hoverGap = 0
        }
      }
    }

    return { base, selectedGap, hoverGap }
  }

  if (mobile) {
    return {
      base: Math.max(comfortMin, Math.min(comfortMax, 280 / Math.max(count, 1))),
      selectedGap,
      hoverGap,
    }
  }

  return {
    base: Math.max(comfortMin, Math.min(comfortMax, 520 / Math.max(count, 1))),
    selectedGap,
    hoverGap,
  }
}

/** Left offsets with extra gaps around selected / hovered cards for easier hitting. */
export function handFanOffsets(
  count: number,
  selected: boolean[],
  hoverIndex: number | null,
  options?: { mobile?: boolean; maxWidth?: number },
): { lefts: number[]; width: number } {
  const mobile = options?.mobile ?? false
  const cardW = mobile ? CARD_SIZE_PX.tiny.w : CARD_SIZE_PX.small.w
  const { base, selectedGap, hoverGap } = planFanGaps(
    count,
    selected,
    hoverIndex,
    options,
  )

  const lefts: number[] = []
  let x = 0
  for (let i = 0; i < count; i++) {
    lefts.push(x)
    if (i < count - 1) {
      let step = base
      if (selected[i] || selected[i + 1]) step += selectedGap
      if (
        hoverIndex !== null &&
        (hoverIndex === i || hoverIndex === i + 1)
      ) {
        step += hoverGap
      }
      x += step
    }
  }

  return { lefts, width: Math.max(cardW, x + cardW) }
}

export function computeHandFanLayout(
  count: number,
  selected: boolean[],
  hoverIndex: number | null,
  options?: { mobile?: boolean; maxWidth?: number },
): HandFanLayout {
  const mobile = options?.mobile ?? false
  const { lefts, width: fanWidth } = handFanOffsets(count, selected, hoverIndex, options)

  /*
   * Large hands + rotation push outer cards past the dock edges.
   * Ease rotation down as the hand grows or when we're fitting to a width.
   */
  const fitting = options?.maxWidth != null && count > 1
  const crowded = fitting && fanWidth >= (options?.maxWidth ?? 0) * 0.9
  const growth = mobile ? count * 0.22 : count * 0.32
  const rotCap = mobile
    ? crowded
      ? 7
      : fitting
        ? 10
        : 12
    : crowded
      ? 10
      : fitting
        ? 14
        : 18
  const maxRot = Math.min(rotCap, (mobile ? 1.25 : 2) + growth)

  const slots = lefts.map((left, index) => {
    const t = count <= 1 ? 0 : index / (count - 1)
    const rotation = -maxRot / 2 + t * maxRot
    const arcY = mobile
      ? Math.abs(t - 0.5) * (crowded ? 4 : 7)
      : Math.abs(t - 0.5) * (crowded ? 8 : 12)
    return { left, rotation, arcY }
  })

  return { lefts, fanWidth, maxRot, slots }
}
