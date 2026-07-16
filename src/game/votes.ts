import type { GameState } from './deal'
import type { PlayerCount } from './teams'
import { partnerSeat } from './teams'

/** Votes required for a strict majority (>50%). */
export function majorityRequired(totalVoters: number): number {
  if (totalVoters <= 0) return 0
  return Math.floor(totalVoters / 2) + 1
}

export function humanSeats(game: GameState): number[] {
  return game.players
    .filter((p) => p.profile.isHuman)
    .map((p) => p.profile.seatIndex)
}

export function startOverReached(votes: number[], humanCount: number): boolean {
  if (humanCount <= 0) return false
  return votes.length >= majorityRequired(humanCount)
}

export type UndoVoteChoice = 'approve' | 'deny'

export interface UndoVoteRequest {
  requesterSeat: number
  /** seatIndex → vote; only eligible voters appear here once cast. */
  votes: Partial<Record<number, UndoVoteChoice>>
}

export function undoEligibleVoters(
  game: GameState,
  requesterSeat: number,
): number[] {
  const partner = partnerSeat(requesterSeat, game.playerCount as PlayerCount)
  return game.players
    .filter(
      (p) =>
        p.profile.isHuman &&
        p.profile.seatIndex !== requesterSeat &&
        p.profile.seatIndex !== partner,
    )
    .map((p) => p.profile.seatIndex)
}

export function undoVoteProgress(
  request: UndoVoteRequest,
  eligible: number[],
): { approvals: number; denials: number; needed: number; pending: number } {
  const needed = majorityRequired(eligible.length)
  let approvals = 0
  let denials = 0
  let pending = 0
  for (const seat of eligible) {
    const vote = request.votes[seat]
    if (vote === 'approve') approvals++
    else if (vote === 'deny') denials++
    else pending++
  }
  return { approvals, denials, needed, pending }
}

/** null = still waiting for votes; otherwise resolved. */
export function resolveUndoRequest(
  request: UndoVoteRequest,
  eligible: number[],
): 'approved' | 'denied' | null {
  if (eligible.length === 0) return 'approved'

  const { approvals, needed, pending } = undoVoteProgress(request, eligible)
  if (pending > 0) return null

  return approvals >= needed ? 'approved' : 'denied'
}
