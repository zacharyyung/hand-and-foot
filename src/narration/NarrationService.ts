import { buildCommentary, computeExcitement, eventCacheKey } from './commentary'
import { resetCommentaryVariety } from './commentaryVariety'
import { generateCommentary } from './llmCommentary'
import { loadNarrationSettings, saveNarrationSettings } from './preferences'
import { NarrationQueue, priorityForEvent } from './NarrationQueue'
import {
  ElevenLabsProvider,
  getElevenLabsProviderStatus,
  refreshElevenLabsProviderStatus,
} from './providers/ElevenLabsProvider'
import {
  DEFAULT_NARRATION_SETTINGS,
  NARRATOR_VOICES,
  type GameNarrationEvent,
  type NarrationFrequency,
  type NarrationSettings,
} from './types'
import { unlockNarrationAudio } from './audioPlayback'
import { getNarratorVoice } from './voices'

class NarrationServiceImpl {
  private settings: NarrationSettings = loadNarrationSettings()
  private queue = new NarrationQueue()
  private elevenLabs = new ElevenLabsProvider()
  private game: import('../game/deal').GameState | null = null
  private lastErrorAt = 0

  constructor() {
    void refreshElevenLabsProviderStatus()
    this.queue.setWorker(async (job) => {
      if (!this.elevenLabs.isAvailable()) return
      const voice = getNarratorVoice(this.settings.voiceId)
      await this.elevenLabs.speak(job.text, {
        voiceId: voice.providerVoiceId,
        speed: this.settings.speed,
        volume: this.settings.volume,
        cacheKey: job.cacheKey,
      })
    })
  }

  getSettings(): NarrationSettings {
    return { ...this.settings }
  }

  updateSettings(partial: Partial<NarrationSettings>): NarrationSettings {
    this.settings = { ...this.settings, ...partial }
    saveNarrationSettings(this.settings)
    if (!this.settings.enabled) {
      this.stop()
    }
    void refreshElevenLabsProviderStatus()
    return this.getSettings()
  }

  setGameContext(game: import('../game/deal').GameState | null): void {
    this.game = game
  }

  unlock(): void {
    unlockNarrationAudio()
  }

  stop(): void {
    this.queue.clear()
    this.elevenLabs.stop()
    queueMicrotask(() => this.queue.resume())
  }

  resetSession(): void {
    this.stop()
    resetCommentaryVariety()
  }

  emit(event: GameNarrationEvent): void {
    if (!this.settings.enabled) return
    if (!this.shouldSpeak(event)) return

    const voice = getNarratorVoice(this.settings.voiceId)
    const excitement = computeExcitement(event)

    void this.enqueueEvent(event, voice.personality, excitement)
  }

  private async enqueueEvent(
    event: GameNarrationEvent,
    personality: import('./types').NarratorPersonality,
    excitement: number,
  ): Promise<void> {
    if (!this.elevenLabs.isAvailable()) return

    const request = { event, game: this.game, personality, excitement }
    const text = this.settings.useLlmCommentary
      ? await generateCommentary(request)
      : buildCommentary(request)

    if (!text.trim()) return

    const voice = getNarratorVoice(this.settings.voiceId)
    const cacheKey = `elevenlabs-v2:${voice.providerVoiceId}:${this.settings.speed}:${eventCacheKey(event, text)}`

    this.queue.enqueue({
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      text,
      priority: priorityForEvent(event.type),
      cacheKey,
      createdAt: Date.now(),
    })
  }

  private shouldSpeak(event: GameNarrationEvent): boolean {
    const frequency = this.settings.frequency

    if (event.type === 'error') {
      const now = Date.now()
      if (now - this.lastErrorAt < 2500) return false
      this.lastErrorAt = now
      return frequency === 'full'
    }

    if (event.type === 'ai_thinking' || event.type === 'chat') return false

    if (event.type === 'draw' || event.type === 'meld_add') return false

    if (frequency === 'full') {
      if (event.type === 'turn_start' && !event.isViewer) return false
      return true
    }

    if (frequency === 'minimal') {
      return (
        event.type === 'game_start' ||
        event.type === 'game_resume' ||
        event.type === 'round_start' ||
        (event.type === 'turn_start' && event.isViewer) ||
        event.type === 'go_out' ||
        event.type === 'round_end' ||
        event.type === 'game_over'
      )
    }

    if (event.type === 'turn_start') return event.isViewer
    if (event.type === 'discard') return event.goingOut || event.goToFoot
    if (event.type === 'meld_start') return false

    return (
      event.type === 'game_start' ||
      event.type === 'game_resume' ||
      event.type === 'round_start' ||
      event.type === 'book_complete' ||
      event.type === 'threshold_met' ||
      event.type === 'go_to_foot' ||
      event.type === 'go_out' ||
      event.type === 'round_end' ||
      event.type === 'game_over'
    )
  }

  isProviderConfigured(): boolean {
    return getElevenLabsProviderStatus().configured
  }

  getActiveProviderLabel(): string {
    const status = getElevenLabsProviderStatus()
    if (!status.configured) return 'ElevenLabs not configured'
    if (status.lastUsed === 'elevenlabs') return 'ElevenLabs'
    return 'ElevenLabs ready'
  }

  getProviderStatusMessage(): string | null {
    const status = getElevenLabsProviderStatus()
    if (status.lastError) return status.lastError
    if (!status.configured) {
      return 'Add ELEVENLABS_API_KEY to .env and restart the dev server to enable narration.'
    }
    return null
  }

  /** Preview a narrator voice via ElevenLabs only (used when picking a voice in settings). */
  async previewVoice(voiceId?: string): Promise<void> {
    unlockNarrationAudio()
    await refreshElevenLabsProviderStatus()
    if (!this.elevenLabs.isAvailable()) {
      throw new Error(this.getProviderStatusMessage() ?? 'ElevenLabs is not configured')
    }

    this.elevenLabs.stop()
    const voice = getNarratorVoice(voiceId ?? this.settings.voiceId)
    await this.elevenLabs.speak(voice.sampleLine, {
      voiceId: voice.providerVoiceId,
      speed: this.settings.speed,
      volume: this.settings.volume,
      cacheKey: `sample-v2:${voice.providerVoiceId}:${this.settings.speed}:${voice.sampleLine}`,
    })
  }
}

export const narrationService = new NarrationServiceImpl()

export function loadNarrationPreference(): boolean {
  return loadNarrationSettings().enabled
}

export {
  DEFAULT_NARRATION_SETTINGS,
  NARRATOR_VOICES,
  type NarrationFrequency,
  type NarrationSettings,
  type GameNarrationEvent,
}
