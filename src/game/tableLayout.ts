import type { PlayerCount } from './teams'
import { partnerSeat } from './teams'

/** Seat offset from viewer's perspective (0 = viewer, half = partner). */
export function seatOffset(
  viewerSeat: number,
  seatIndex: number,
  playerCount: PlayerCount,
): number {
  return (seatIndex - viewerSeat + playerCount) % playerCount
}

export function getViewerSeat(
  players: Array<{ profile: { seatIndex: number; isHuman: boolean } }>,
): number {
  const human = players.find((p) => p.profile.isHuman)
  return human?.profile.seatIndex ?? 0
}

export type CompassSide = 'north' | 'south' | 'east' | 'west' | 'ne' | 'nw' | 'se' | 'sw'

/**
 * Seat plaques sit in the margin OUTSIDE the rounded table.
 * Books grow from each plaque inward onto the felt.
 */
const COMPASS_COORDS: Record<CompassSide, { left: number; top: number }> = {
  south: { left: 50, top: 97 },
  north: { left: 50, top: 2 },
  west: { left: 1.5, top: 50 },
  east: { left: 98.5, top: 50 },
  nw: { left: 1.5, top: 3 },
  ne: { left: 98.5, top: 3 },
  sw: { left: 1.5, top: 97 },
  se: { left: 98.5, top: 97 },
}

/** Map relative seat offset to compass position from viewer's perspective. */
export function compassSide(offset: number, playerCount: PlayerCount): CompassSide {
  const half = playerCount / 2
  if (offset === 0) return 'south'
  if (offset === half) return 'north'

  if (playerCount === 4) {
    if (offset === 1) return 'east'
    return 'west'
  }

  if (playerCount === 6) {
    const map: Record<number, CompassSide> = {
      1: 'se',
      2: 'ne',
      4: 'nw',
      5: 'sw',
    }
    return map[offset] ?? 'east'
  }

  if (playerCount === 8) {
    const map: Record<number, CompassSide> = {
      1: 'se',
      2: 'east',
      3: 'ne',
      5: 'nw',
      6: 'west',
      7: 'sw',
    }
    return map[offset] ?? 'east'
  }

  const map: Record<number, CompassSide> = {
    1: 'se',
    2: 'se',
    3: 'east',
    4: 'ne',
    5: 'ne',
    6: 'nw',
    7: 'nw',
    8: 'west',
    9: 'sw',
  }
  return map[offset] ?? 'east'
}

export function seatCoordinates(
  offset: number,
  playerCount: PlayerCount,
): { left: number; top: number; side: CompassSide } {
  const side = compassSide(offset, playerCount)
  return { ...COMPASS_COORDS[side], side }
}

export function isPartner(
  viewerSeat: number,
  seatIndex: number,
  playerCount: PlayerCount,
): boolean {
  return seatIndex === partnerSeat(viewerSeat, playerCount)
}

export type SeatRole = 'you' | 'partner' | 'opponent'

export function seatRole(
  viewerSeat: number,
  seatIndex: number,
  playerCount: PlayerCount,
): SeatRole {
  const offset = seatOffset(viewerSeat, seatIndex, playerCount)
  if (offset === 0) return 'you'
  if (offset === playerCount / 2) return 'partner'
  return 'opponent'
}
