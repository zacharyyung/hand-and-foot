import type { Card } from '../cards'
import type { Book } from '../books'
import type { GameState, TurnPhase } from '../deal'
import { playerFootCount, playerHandCount } from '../deal'
import { meldThreshold } from '../scoring'

/**
 * Information visible to an AI — same limits as a human at the table.
 * AIs see melded books and pile counts, but never another player's hand or foot cards.
 */
export interface AiPublicState {
  mySeatIndex: number
  myTeamId: number
  myHand: Card[]
  myFootCount: number
  isPlayingFoot: boolean
  footOnHold: boolean
  stockCount: number
  discardTop: Card | null
  discardCount: number
  myTeamBooks: Book[]
  /** All melded books on the table (visible to everyone). */
  allTableBooks: Book[]
  teamScore: number
  teamMeldThresholdMet: boolean
  meldPointsThisTurn: number
  requiredMeld: number
  /** Other players — counts only, never card contents (includes partner). */
  otherPlayers: Array<{
    seatIndex: number
    name: string
    teamId: number
    handCount: number
    footCount: number
    isPlayingFoot: boolean
  }>
  turnPhase: TurnPhase
}

export function buildAiPublicState(state: GameState, seatIndex: number): AiPublicState {
  const player = state.players[seatIndex]
  const team = state.teams.find((t) => t.id === player.profile.teamId)!

  return {
    mySeatIndex: seatIndex,
    myTeamId: player.profile.teamId,
    myHand: [...player.hand],
    myFootCount: playerFootCount(player),
    isPlayingFoot: player.isPlayingFoot,
    footOnHold: player.footOnHold,
    stockCount: state.stock.length,
    discardTop: state.discard[state.discard.length - 1] ?? null,
    discardCount: state.discard.length,
    myTeamBooks: team.books.map((b) => ({ ...b, cards: [...b.cards] })),
    allTableBooks: state.teams.flatMap((t) => t.books.map((b) => ({ ...b, cards: [...b.cards] }))),
    teamScore: team.score,
    teamMeldThresholdMet: team.meldThresholdMet,
    meldPointsThisTurn: state.meldPointsThisTurn,
    requiredMeld: meldThreshold(team.score),
    otherPlayers: state.players
      .filter((_, i) => i !== seatIndex)
      .map((p) => ({
        seatIndex: p.profile.seatIndex,
        name: p.profile.name,
        teamId: p.profile.teamId,
        handCount: playerHandCount(p),
        footCount: playerFootCount(p),
        isPlayingFoot: p.isPlayingFoot,
      })),
    turnPhase: state.turnPhase,
  }
}
