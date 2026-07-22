/** Parse ElevenLabs error payloads into a short user-facing message. */
export function parseElevenLabsError(raw: unknown, status?: number): string {
  if (typeof raw === 'string') {
    try {
      return parseElevenLabsError(JSON.parse(raw), status)
    } catch {
      const trimmed = raw.trim()
      if (trimmed.startsWith('{')) {
        return 'ElevenLabs voice unavailable. Try another narrator.'
      }
      return trimmed.slice(0, 200) || `ElevenLabs TTS failed (${status ?? 'unknown'})`
    }
  }

  if (raw && typeof raw === 'object') {
    const obj = raw as Record<string, unknown>

    if (obj.code === 'paid_plan_required' || obj.type === 'payment_required') {
      return 'This voice requires a paid ElevenLabs plan. Try Morgan or Alex instead.'
    }

    if (typeof obj.message === 'string') return obj.message

    if (obj.detail) {
      return parseElevenLabsError(obj.detail, status)
    }

    if (typeof obj.error === 'string') return obj.error
    if (typeof obj.hint === 'string') return obj.hint
  }

  return `ElevenLabs TTS failed (${status ?? 'unknown'})`
}
