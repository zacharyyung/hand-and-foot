export type PlayerCount = 4 | 6 | 8 | 10

export const PLAYER_COUNT_OPTIONS: PlayerCount[] = [4, 6, 8, 10]

export function teamIdForSeat(seatIndex: number, playerCount: PlayerCount): number {
  return seatIndex % (playerCount / 2)
}

export function partnerSeat(seatIndex: number, playerCount: PlayerCount): number {
  return (seatIndex + playerCount / 2) % playerCount
}

export function nextSeatCounterClockwise(seatIndex: number, playerCount: PlayerCount): number {
  return (seatIndex - 1 + playerCount) % playerCount
}

export function teamCount(playerCount: PlayerCount): number {
  return playerCount / 2
}

/** Soft, readable team accents — not neon dashboard chips. */
export const TEAM_COLORS = [
  '#7eb6e8',
  '#e07a7a',
  '#7dbe8f',
  '#c4a0e0',
  '#e0b86a',
] as const
