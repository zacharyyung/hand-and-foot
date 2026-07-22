import { parseElevenLabsError } from '../parseElevenLabsError'
import { buildCacheKey, getCachedAudio, setCachedAudio } from '../audioCache'
import { playArrayBuffer, playBlob, stopPlayback } from '../audioPlayback'
import type { NarrationProvider, SpeakOptions } from '../types'

export interface ProviderStatus {
  configured: boolean
  lastUsed: 'elevenlabs' | null
  lastError: string | null
}

let providerStatus: ProviderStatus = {
  configured: false,
  lastUsed: null,
  lastError: null,
}

export function getElevenLabsProviderStatus(): ProviderStatus {
  return { ...providerStatus }
}

export function markWebSpeechUsed(): void {
  /* Browser TTS is disabled — kept for API compatibility. */
}

export async function refreshElevenLabsProviderStatus(): Promise<ProviderStatus> {
  try {
    const response = await fetch('/api/narration-tts', { method: 'GET' })
    if (response.ok) {
      const data = (await response.json()) as { configured?: boolean }
      providerStatus = {
        ...providerStatus,
        configured: Boolean(data.configured),
      }
    }
  } catch {
    providerStatus = {
      ...providerStatus,
      configured: false,
      lastError: 'Could not reach narration API',
    }
  }
  return getElevenLabsProviderStatus()
}

export class ElevenLabsProvider implements NarrationProvider {
  readonly id = 'elevenlabs'

  isAvailable(): boolean {
    return providerStatus.configured
  }

  stop(): void {
    stopPlayback()
  }

  async speak(text: string, options: SpeakOptions): Promise<void> {
    const cacheKey =
      options.cacheKey ??
      buildCacheKey({
        providerId: `${this.id}-v2`,
        voiceId: options.voiceId,
        speed: options.speed,
        text,
      })

    const cached = await getCachedAudio(cacheKey)
    if (cached) {
      providerStatus = { ...providerStatus, lastUsed: 'elevenlabs', lastError: null }
      await playArrayBuffer(cached, options.volume)
      return
    }

    const response = await fetch('/api/narration-tts', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'audio/mpeg',
      },
      body: JSON.stringify({
        text,
        voiceId: options.voiceId,
        speed: options.speed,
      }),
    })

    if (!response.ok) {
      let detail = `ElevenLabs TTS failed (${response.status})`
      try {
        const payload = await response.json()
        detail = parseElevenLabsError(payload, response.status)
      } catch {
        try {
          detail = parseElevenLabsError(await response.text(), response.status)
        } catch {
          /* ignore */
        }
      }
      providerStatus = { ...providerStatus, lastError: detail }
      throw new Error(detail)
    }

    const buffer = await response.arrayBuffer()
    providerStatus = { ...providerStatus, lastUsed: 'elevenlabs', lastError: null }
    void setCachedAudio(cacheKey, buffer)
    await playBlob(new Blob([buffer], { type: 'audio/mpeg' }), options.volume)
  }
}
