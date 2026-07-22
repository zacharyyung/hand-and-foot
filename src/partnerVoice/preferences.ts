import { DEFAULT_PARTNER_VOICE_SETTINGS, type PartnerVoiceSettings } from './types'

const STORAGE_KEY = 'hand-and-foot-partner-voice'

export function loadPartnerVoiceSettings(): PartnerVoiceSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) {
      const legacy = localStorage.getItem('hand-and-foot-narration')
      if (legacy) {
        const parsed = JSON.parse(legacy) as {
          enabled?: boolean
          volume?: number
          speed?: number
          voiceId?: string
        }
        return {
          enabled: parsed.enabled ?? DEFAULT_PARTNER_VOICE_SETTINGS.enabled,
          volume: parsed.volume ?? DEFAULT_PARTNER_VOICE_SETTINGS.volume,
          speed: parsed.speed ?? DEFAULT_PARTNER_VOICE_SETTINGS.speed,
          voiceId: parsed.voiceId ?? DEFAULT_PARTNER_VOICE_SETTINGS.voiceId,
        }
      }
      return { ...DEFAULT_PARTNER_VOICE_SETTINGS }
    }
    const parsed = JSON.parse(raw) as Partial<PartnerVoiceSettings>
    return {
      enabled: parsed.enabled ?? DEFAULT_PARTNER_VOICE_SETTINGS.enabled,
      volume: parsed.volume ?? DEFAULT_PARTNER_VOICE_SETTINGS.volume,
      speed: parsed.speed ?? DEFAULT_PARTNER_VOICE_SETTINGS.speed,
      voiceId: parsed.voiceId ?? DEFAULT_PARTNER_VOICE_SETTINGS.voiceId,
    }
  } catch {
    return { ...DEFAULT_PARTNER_VOICE_SETTINGS }
  }
}

export function savePartnerVoiceSettings(settings: PartnerVoiceSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
  } catch {
    /* ignore */
  }
}
