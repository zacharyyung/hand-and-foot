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

export const TEAM_COLORS = [
  '#3b82f6',
  '#ef4444',
  '#22c55e',
  '#a855f7',
  '#f59e0b',
] as const
