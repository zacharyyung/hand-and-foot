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

const COMPASS_COORDS: Record<CompassSide, { left: number; top: number }> = {
  south: { left: 50, top: 78 },
  north: { left: 50, top: 6 },
  west: { left: 6, top: 50 },
  east: { left: 94, top: 50 },
  nw: { left: 12, top: 14 },
  ne: { left: 88, top: 14 },
  sw: { left: 12, top: 78 },
  se: { left: 88, top: 78 },
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

/** Chip on the outer edge; books sit between chip and table center. */
export function seatPanelLayout(side: CompassSide): string {
  switch (side) {
    case 'north':
      return 'flex-col items-center'
    case 'south':
      return 'flex-col items-center'
    case 'west':
      return 'flex-row items-center'
    case 'east':
      return 'flex-row-reverse items-center'
    case 'nw':
      return 'flex-col items-start'
    case 'ne':
      return 'flex-col items-end'
    case 'sw':
      return 'flex-col-reverse items-start'
    case 'se':
      return 'flex-col-reverse items-end'
    default:
      return 'flex-col items-center'
  }
}

/** Books grow toward the center in an organized row/column. */
export function booksGrowClasses(side: CompassSide): string {
  const base = 'shrink-0'
  switch (side) {
    case 'north':
      return `${base} flex max-w-[min(88vw,34rem)] flex-row flex-nowrap items-start justify-center gap-1.5 overflow-x-auto overflow-y-visible py-1`
    case 'south':
      return `${base} flex max-w-[min(72vw,26rem)] flex-row flex-nowrap items-end justify-center gap-1.5 overflow-x-auto overflow-y-visible py-1`
    case 'west':
      return `${base} flex max-w-[min(15vw,6rem)] flex-row flex-wrap items-center justify-start gap-1`
    case 'east':
      return `${base} flex max-w-[min(15vw,6rem)] flex-row-reverse flex-wrap items-center justify-end gap-1`
    case 'nw':
      return `${base} flex max-w-[min(18vw,7rem)] flex-row flex-wrap items-end justify-start gap-1`
    case 'ne':
      return `${base} flex max-w-[min(18vw,7rem)] flex-row-reverse flex-wrap items-end justify-end gap-1`
    case 'sw':
      return `${base} flex max-w-[min(18vw,7rem)] flex-row flex-wrap items-start justify-start gap-1`
    case 'se':
      return `${base} flex max-w-[min(18vw,7rem)] flex-row-reverse flex-wrap items-start justify-end gap-1`
    default:
      return `${base} flex flex-row flex-wrap justify-center gap-1`
  }
}
