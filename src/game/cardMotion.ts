import { useCallback, useRef, useState } from 'react'

export type CardMotionKind = 'draw' | 'place' | 'discard'

export const CARD_MOTION_DURATION: Record<CardMotionKind, number> = {
  draw: 320,
  place: 380,
  discard: 350,
}

/** Manual settle cues (e.g. hand reorder) — table flights use CardFlightLayer. */
export function useCardSettleMotion() {
  const [motions, setMotions] = useState<Record<string, CardMotionKind>>({})
  const pendingClearRef = useRef(new Set<string>())
  const timerRef = useRef<number | null>(null)

  const scheduleClear = useCallback((ms: number) => {
    if (timerRef.current) window.clearTimeout(timerRef.current)
    timerRef.current = window.setTimeout(() => {
      const ids = pendingClearRef.current
      setMotions((prev) => {
        const next = { ...prev }
        for (const id of ids) delete next[id]
        return next
      })
      pendingClearRef.current = new Set()
      timerRef.current = null
    }, ms)
  }, [])

  const markMotion = useCallback(
    (cardIds: string[], kind: CardMotionKind) => {
      if (cardIds.length === 0) return
      setMotions((prev) => {
        const next = { ...prev }
        for (const id of cardIds) next[id] = kind
        return next
      })
      for (const id of cardIds) pendingClearRef.current.add(id)
      scheduleClear(CARD_MOTION_DURATION[kind])
    },
    [scheduleClear],
  )

  const getMotion = useCallback(
    (cardId: string): CardMotionKind | undefined => motions[cardId],
    [motions],
  )

  return { getMotion, markMotion }
}
