/** Shared hand-fan geometry — keep in sync with HandCards rendering. */

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

/** Left offsets with extra gaps around selected / hovered cards for easier hitting. */
export function handFanOffsets(
  count: number,
  selected: boolean[],
  hoverIndex: number | null,
  options?: { mobile?: boolean; maxWidth?: number },
): { lefts: number[]; width: number } {
  const mobile = options?.mobile ?? false
  const cardW = mobile ? 30 : 46
  const countForStep = Math.max(count, 1)
  const maxWidth = options?.maxWidth
  let base: number
  if (maxWidth && count > 1) {
    const budget = Math.max(cardW, maxWidth - cardW)
    const minStep = mobile ? 6 : 10
    const maxStep = mobile ? 18 : 42
    base = Math.max(minStep, Math.min(maxStep, budget / (count - 1)))
  } else if (mobile) {
    base = Math.max(8, Math.min(18, 280 / countForStep))
  } else {
    base = Math.max(24, Math.min(42, 520 / countForStep))
  }
  const selectedGap = mobile
    ? maxWidth && count > 8
      ? 6
      : 8
    : maxWidth && count > 12
      ? 8
      : 16
  const hoverGap = mobile ? 6 : maxWidth && count > 12 ? 6 : 12

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
  const maxRot = mobile ? Math.min(14, 2 + count * 0.35) : Math.min(22, 3 + count * 0.45)

  const slots = lefts.map((left, index) => {
    const t = count <= 1 ? 0 : index / (count - 1)
    const rotation = -maxRot / 2 + t * maxRot
    const arcY = mobile ? Math.abs(t - 0.5) * 8 : Math.abs(t - 0.5) * 14
    return { left, rotation, arcY }
  })

  return { lefts, fanWidth, maxRot, slots }
}
