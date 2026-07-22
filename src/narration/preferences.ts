import {
  DEFAULT_NARRATION_SETTINGS,
  type NarrationFrequency,
  type NarrationSettings,
} from './types'

const STORAGE_KEY = 'hand-and-foot-narration'

interface StoredNarrationSettings {
  enabled?: boolean
  volume?: number
  frequency?: NarrationFrequency
  speed?: number
  voiceId?: string
  useLlmCommentary?: boolean
}

export function loadNarrationSettings(): NarrationSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { ...DEFAULT_NARRATION_SETTINGS }
    const parsed = JSON.parse(raw) as StoredNarrationSettings
    return {
      enabled: parsed.enabled ?? DEFAULT_NARRATION_SETTINGS.enabled,
      volume: clamp(parsed.volume ?? DEFAULT_NARRATION_SETTINGS.volume, 0, 1),
      frequency: parsed.frequency ?? DEFAULT_NARRATION_SETTINGS.frequency,
      speed: clamp(parsed.speed ?? DEFAULT_NARRATION_SETTINGS.speed, 0.7, 1.3),
      voiceId: parsed.voiceId ?? DEFAULT_NARRATION_SETTINGS.voiceId,
      useLlmCommentary:
        parsed.useLlmCommentary ?? DEFAULT_NARRATION_SETTINGS.useLlmCommentary,
    }
  } catch {
    return { ...DEFAULT_NARRATION_SETTINGS }
  }
}

export function saveNarrationSettings(settings: NarrationSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
  } catch {
    /* ignore storage errors */
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}
