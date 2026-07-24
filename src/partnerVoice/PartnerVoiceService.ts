import { loadPartnerVoiceSettings, savePartnerVoiceSettings } from './preferences'
import { ElevenLabsProvider, refreshElevenLabsProviderStatus } from '../narration/providers/ElevenLabsProvider'
import { unlockNarrationAudio } from '../narration/audioPlayback'
import { getNarratorVoice } from '../narration/voices'
import type { PartnerVoiceSettings } from './types'
import { getElevenLabsSetupHint } from './deploymentHint'

class PartnerVoiceServiceImpl {
  private settings: PartnerVoiceSettings = loadPartnerVoiceSettings()
  private elevenLabs = new ElevenLabsProvider()
  private queue: string[] = []
  private processing = false

  getSettings(): PartnerVoiceSettings {
    return { ...this.settings }
  }

  updateSettings(partial: Partial<PartnerVoiceSettings>): PartnerVoiceSettings {
    this.settings = { ...this.settings, ...partial }
    savePartnerVoiceSettings(this.settings)
    void refreshElevenLabsProviderStatus()
    return this.getSettings()
  }

  unlock(): void {
    unlockNarrationAudio()
  }

  stop(): void {
    this.queue = []
    this.elevenLabs.stop()
    this.processing = false
  }

  isConfigured(): boolean {
    return this.elevenLabs.isAvailable()
  }

  getStatusMessage(): string | null {
    if (!this.elevenLabs.isAvailable()) {
      return getElevenLabsSetupHint()
    }
    return null
  }

  /** Queue partner speech — never blocks gameplay. */
  speak(text: string): void {
    if (!this.settings.enabled || !text.trim()) return
    this.queue.push(text.trim())
    void this.pump()
  }

  /** Immediate sample for settings UI. */
  async previewVoice(voiceId?: string): Promise<void> {
    unlockNarrationAudio()
    await refreshElevenLabsProviderStatus()
    if (!this.elevenLabs.isAvailable()) {
      throw new Error(this.getStatusMessage() ?? 'ElevenLabs is not configured')
    }
    this.stop()
    const voice = getNarratorVoice(voiceId ?? this.settings.voiceId)
    await this.elevenLabs.speak(voice.sampleLine, {
      voiceId: voice.providerVoiceId,
      speed: this.settings.speed,
      volume: this.settings.volume,
      cacheKey: `partner-sample-v2:${voice.providerVoiceId}:${voice.sampleLine}`,
    })
  }

  private async pump(): Promise<void> {
    if (this.processing || !this.settings.enabled) return
    const next = this.queue.shift()
    if (!next) return

    if (!this.elevenLabs.isAvailable()) return

    this.processing = true
    try {
      const voice = getNarratorVoice(this.settings.voiceId)
      await this.elevenLabs.speak(next, {
        voiceId: voice.providerVoiceId,
        speed: this.settings.speed,
        volume: this.settings.volume,
        cacheKey: `partner-v2:${voice.providerVoiceId}:${this.settings.speed}:${next}`,
      })
    } catch {
      /* partner voice failures should not interrupt play */
    } finally {
      this.processing = false
      if (this.queue.length > 0) void this.pump()
    }
  }
}

export const partnerVoiceService = new PartnerVoiceServiceImpl()
