import type { Card, Rank } from '../game/cards'
import type { GameState } from '../game/deal'
import type { RoundScoreBreakdown } from '../game/roundScoring'

export type NarrationFrequency = 'minimal' | 'normal' | 'full'

export type NarratorPersonality = 'dealer' | 'commentator' | 'storyteller'

export interface NarratorVoice {
  id: string
  name: string
  personality: NarratorPersonality
  /** ElevenLabs voice ID */
  providerVoiceId: string
  description: string
  /** Spoken when previewing this voice in settings */
  sampleLine: string
}

export interface NarrationSettings {
  enabled: boolean
  volume: number
  frequency: NarrationFrequency
  speed: number
  voiceId: string
  useLlmCommentary: boolean
}

export const DEFAULT_NARRATION_SETTINGS: NarrationSettings = {
  enabled: false,
  volume: 0.85,
  frequency: 'normal',
  speed: 1,
  voiceId: 'dealer',
  useLlmCommentary: false,
}

export const NARRATOR_VOICES: NarratorVoice[] = [
  {
    id: 'dealer',
    name: 'Morgan',
    personality: 'dealer',
    // ElevenLabs Adam — keep as the warm baseline dealer.
    providerVoiceId: 'pNInz6obpgDQGcFmaJgB',
    description: 'Warm, steady dealer at a premium card table.',
    sampleLine:
      'Take a seat — the cards are shuffled, your foot is waiting, and Hand and Foot is ready when you are.',
  },
  {
    id: 'commentator',
    name: 'Alex',
    personality: 'commentator',
    // ElevenLabs Chris — Antoni (ErXwobaYiN019PkySvjV) now redirects to Adam,
    // which made Alex sound identical to Morgan.
    providerVoiceId: 'iP95p4xoKVk53GoZ742B',
    description: 'Energetic play-by-play with a smile in the voice.',
    sampleLine:
      'Cards are on the felt, the stock pile is humming, and this table is ready for a fun round.',
  },
  {
    id: 'storyteller',
    name: 'Eleanor',
    personality: 'storyteller',
    // ElevenLabs Sarah (formerly Bella on this voice ID).
    providerVoiceId: 'EXAVITQu4vr4xnSDxMaL',
    description: 'Measured storyteller who savors the drama.',
    sampleLine:
      'Eleven cards in the hand, eleven in the foot — shuffle gently, play boldly, and enjoy the story.',
  },
]

export type NarrationPriority = 'ambient' | 'normal' | 'highlight' | 'critical'

export type GameNarrationEvent =
  | { type: 'game_start'; roundNumber: number; playerCount: number }
  | { type: 'game_resume' }
  | { type: 'round_start'; roundNumber: number }
  | { type: 'turn_start'; playerName: string; isViewer: boolean; isPlayingFoot: boolean }
  | { type: 'draw'; playerName: string; count: number; fromStock: boolean }
  | { type: 'meld_start'; playerName: string; rank: Rank; cardCount: number; teamId: number }
  | { type: 'meld_add'; playerName: string; rank: Rank; cardCount: number; bookComplete: boolean }
  | { type: 'book_complete'; teamId: number; rank: Rank; clean: boolean; playerName: string }
  | { type: 'threshold_met'; teamId: number; points: number; playerName: string }
  | { type: 'discard'; playerName: string; card: Card; goingOut: boolean; goToFoot: boolean }
  | { type: 'go_to_foot'; playerName: string }
  | { type: 'go_out'; teamId: number; playerName: string }
  | { type: 'round_end'; wentOutTeamId: number | null; breakdowns: RoundScoreBreakdown[] }
  | { type: 'game_over'; winnerTeamId: number; score: number }
  | { type: 'error'; message: string }
  | { type: 'chat'; senderName: string; text: string }
  | { type: 'ai_thinking'; playerName: string }

export interface CommentaryRequest {
  event: GameNarrationEvent
  game: GameState | null
  personality: NarratorPersonality
  excitement: number
}

export interface NarrationProvider {
  readonly id: string
  isAvailable(): boolean
  speak(text: string, options: SpeakOptions): Promise<void>
  stop(): void
}

export interface SpeakOptions {
  voiceId: string
  speed: number
  volume: number
  cacheKey?: string
}

export interface NarrationJob {
  id: string
  text: string
  priority: NarrationPriority
  cacheKey: string
  createdAt: number
}
