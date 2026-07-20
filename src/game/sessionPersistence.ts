import type { AiDifficulty, GameState } from './deal'
import type { ChatMessage } from './chat'
import type { UndoVoteRequest } from './votes'
import type { PlayerCount } from './teams'

const SESSION_KEY = 'hand-and-foot-session'
const SESSION_VERSION = 1 as const
const MAX_HISTORY = 20

export interface PersistedSetupHuman {
  name: string
  age: number
  avatar: string
}

export interface PersistedSetup {
  playerCount: PlayerCount
  humanCount: number
  humanPlayers: PersistedSetupHuman[]
  aiDifficulty: AiDifficulty
}

export interface PersistedSession {
  version: typeof SESSION_VERSION
  savedAt: number
  setup: PersistedSetup
  game: GameState
  chatMessages: ChatMessage[]
  gameHistory: GameState[]
  startOverVotes: number[]
  undoRequest: UndoVoteRequest | null
}

export interface SavedSessionSummary {
  savedAt: number
  roundNumber: number
  phase: GameState['phase']
  playerCount: PlayerCount
  humanCount: number
}

function isPlayerCount(value: unknown): value is PlayerCount {
  return value === 4 || value === 6
}

function isValidSession(value: unknown): value is PersistedSession {
  if (!value || typeof value !== 'object') return false
  const session = value as PersistedSession
  if (session.version !== SESSION_VERSION) return false
  if (!session.game || typeof session.game !== 'object') return false
  if (!session.setup || typeof session.setup !== 'object') return false
  if (!isPlayerCount(session.setup.playerCount)) return false
  if (!Array.isArray(session.chatMessages)) return false
  if (!Array.isArray(session.gameHistory)) return false
  if (!Array.isArray(session.startOverVotes)) return false
  if (!Array.isArray(session.game.players) || session.game.players.length === 0) {
    return false
  }
  return true
}

export function loadPersistedSession(): PersistedSession | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY)
    if (!raw) return null
    const parsed: unknown = JSON.parse(raw)
    if (!isValidSession(parsed)) {
      localStorage.removeItem(SESSION_KEY)
      return null
    }
    return parsed
  } catch {
    return null
  }
}

export function peekSavedSessionSummary(): SavedSessionSummary | null {
  const session = loadPersistedSession()
  if (!session) return null
  return {
    savedAt: session.savedAt,
    roundNumber: session.game.roundNumber,
    phase: session.game.phase,
    playerCount: session.setup.playerCount,
    humanCount: session.setup.humanCount,
  }
}

export function savePersistedSession(input: {
  setup: PersistedSetup
  game: GameState
  chatMessages: ChatMessage[]
  gameHistory: GameState[]
  startOverVotes: number[]
  undoRequest: UndoVoteRequest | null
}): void {
  try {
    const payload: PersistedSession = {
      version: SESSION_VERSION,
      savedAt: Date.now(),
      setup: input.setup,
      game: input.game,
      chatMessages: input.chatMessages,
      gameHistory: input.gameHistory.slice(-MAX_HISTORY),
      startOverVotes: input.startOverVotes,
      undoRequest: input.undoRequest,
    }
    localStorage.setItem(SESSION_KEY, JSON.stringify(payload))
  } catch {
    // Quota / private mode — ignore
  }
}

export function clearPersistedSession(): void {
  try {
    localStorage.removeItem(SESSION_KEY)
  } catch {
    // ignore
  }
}

export function formatSavedSessionLabel(summary: SavedSessionSummary): string {
  const phaseLabel =
    summary.phase === 'playing'
      ? 'in progress'
      : summary.phase === 'roundEnd'
        ? 'round tally'
        : summary.phase === 'gameOver'
          ? 'finished'
          : 'saved'
  return `Round ${summary.roundNumber} · ${summary.playerCount} players · ${phaseLabel}`
}
