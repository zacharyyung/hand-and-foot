import type { Card } from './cards'
import {
  CARDS_PER_FOOT,
  CARDS_PER_HAND,
  createDecks,
} from './cards'
import { shuffleDeck } from './shuffle'
import type { Book } from './books'
import { teamIdForSeat, type PlayerCount } from './teams'

export type AiDifficulty = 'easy' | 'medium' | 'difficult'

export interface PlayerProfile {
  seatIndex: number
  name: string
  age: number
  avatar: string
  teamId: number
  isHuman: boolean
  aiDifficulty: AiDifficulty | null
}

export interface PlayerState {
  profile: PlayerProfile
  hand: Card[]
  foot: Card[]
  isPlayingFoot: boolean
  /** Foot was picked up but cannot be played until next turn (discarded into foot). */
  footOnHold: boolean
}

export interface TeamState {
  id: number
  score: number
  books: Book[]
  meldThresholdMet: boolean
}

export type TurnPhase = 'draw' | 'play' | 'discard'
export type GamePhase = 'setup' | 'playing' | 'roundEnd' | 'gameOver'

export interface GameState {
  phase: GamePhase
  playerCount: PlayerCount
  players: PlayerState[]
  teams: TeamState[]
  stock: Card[]
  discard: Card[]
  currentPlayerIndex: number
  roundStarterIndex: number
  roundNumber: number
  turnPhase: TurnPhase
  meldPointsThisTurn: number
  wentOutTeamId: number | null
  roundScores: Record<number, number> | null
  winnerTeamId: number | null
}

export interface SetupPlayer {
  name: string
  age: number
  avatar: string
  isHuman: boolean
  aiDifficulty: AiDifficulty
}

function dealCards(deck: Card[], count: number): { dealt: Card[]; remaining: Card[] } {
  return {
    dealt: deck.slice(0, count),
    remaining: deck.slice(count),
  }
}

export function createInitialTeams(playerCount: PlayerCount): TeamState[] {
  const count = playerCount / 2
  return Array.from({ length: count }, (_, id) => ({
    id,
    score: 0,
    books: [],
    meldThresholdMet: false,
  }))
}

export function buildProfiles(
  setupPlayers: SetupPlayer[],
  playerCount: PlayerCount,
): PlayerProfile[] {
  return setupPlayers.map((player, seatIndex) => ({
    seatIndex,
    name: player.isHuman
      ? player.name.trim() || `Player ${seatIndex + 1}`
      : player.name.trim() || `AI ${seatIndex + 1}`,
    age: player.age,
    avatar: player.avatar,
    teamId: teamIdForSeat(seatIndex, playerCount),
    isHuman: player.isHuman,
    aiDifficulty: player.isHuman ? null : player.aiDifficulty,
  }))
}

export function findFirstPlayerSeat(profiles: PlayerProfile[]): number {
  const humans = profiles.filter((p) => p.isHuman)
  if (humans.length === 0) return 0
  if (humans.length === 1) return humans[0].seatIndex

  let youngest = humans[0].seatIndex
  let minAge = humans[0].age
  for (const profile of humans) {
    if (profile.age < minAge) {
      minAge = profile.age
      youngest = profile.seatIndex
    }
  }
  return youngest
}

/** @deprecated Use findFirstPlayerSeat */
export function findYoungestSeat(profiles: PlayerProfile[]): number {
  return findFirstPlayerSeat(profiles)
}

export function dealNewRound(
  profiles: PlayerProfile[],
  playerCount: PlayerCount,
  teams: TeamState[],
  roundStarterIndex: number,
  roundNumber: number,
): GameState {
  const shuffled = shuffleDeck(createDecks(playerCount))
  let deck = shuffled
  const players: PlayerState[] = []

  for (let i = 0; i < playerCount; i++) {
    const footDeal = dealCards(deck, CARDS_PER_FOOT)
    deck = footDeal.remaining
    players.push({
      profile: profiles[i],
      hand: [],
      foot: footDeal.dealt,
      isPlayingFoot: false,
      footOnHold: false,
    })
  }

  for (let i = 0; i < playerCount; i++) {
    const handDeal = dealCards(deck, CARDS_PER_HAND)
    deck = handDeal.remaining
    players[i].hand = handDeal.dealt
  }

  const resetTeams = teams.map((team) => ({
    ...team,
    books: [],
    meldThresholdMet: false,
  }))

  return {
    phase: 'playing',
    playerCount,
    players,
    teams: resetTeams,
    stock: deck,
    discard: [],
    currentPlayerIndex: roundStarterIndex,
    roundStarterIndex,
    roundNumber,
    turnPhase: 'draw',
    meldPointsThisTurn: 0,
    wentOutTeamId: null,
    roundScores: null,
    winnerTeamId: null,
  }
}

export function startNewGame(
  setupPlayers: SetupPlayer[],
  playerCount: PlayerCount,
): GameState {
  const profiles = buildProfiles(setupPlayers, playerCount)
  const teams = createInitialTeams(playerCount)
  const youngest = findFirstPlayerSeat(profiles)

  return dealNewRound(profiles, playerCount, teams, youngest, 1)
}
